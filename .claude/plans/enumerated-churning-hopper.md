# Pipeline Architecture: Universal dbt Normalization Layer

## Context

The app needs to support 4 categories of Fivetran connectors, each with different data challenges. Rather than handling these ad-hoc, we add a universal dbt layer between Fivetran and ETL. Every connector — regardless of type — passes through a dbt model that normalizes its data before the existing ETL (map → label → datamart) touches it.

## The 4 Connector Categories

| Category | Problem | dbt Solution | Example |
|----------|---------|-------------|---------|
| **API** | Multiple tables per connector | JOIN into single staging table | Meta Ads, Google Ads |
| **File Upload** | Re-uploads create duplicates | Dedup on dataset type's required columns | CSV upload via GCS |
| **File System** | Deleted source files leave orphaned rows | Filter to rows from active files only | SFTP, S3 |
| **Database** | Fivetran soft-deletes via `_fivetran_deleted` | `WHERE _fivetran_deleted = false` | Postgres, MySQL |

All models also normalize types (date parsing, safe casts) and handle nulls. Unknown connector types use a **passthrough** model (forward data as-is).

## Data Flow

```
Fivetran Sync
  → fivetran_sync_sensor (detects sync_state='synced')
  → transform_job (dbt_staging asset)
      1. Look up connector service + schema
      2. dbt run --select {model} --vars {schema, project, source_table...} --full-refresh
      3. Output: {fivetran_schema}.stg_{service}
      4. Insert PipelineRun(status='pending') for mapped data sources
  → pending_run_sensor (existing, unchanged)
  → etl_asset_job (mapped → labelled → datamart, unchanged)
```

**Key design:** dbt writes its output into the Fivetran connector's own schema (via custom `generate_schema_name` macro). `DataSource.bq_table` points to `stg_{service}`. The ETL reads `{schema_name}.{bq_table}` — **zero ETL code changes**.

## dbt Project Structure

```
pipeline/dbt/
  dbt_project.yml                        # materialized: table (full refresh)
  profiles.yml                           # BQ connection from env vars
  macros/
    generate_schema_name.sql             # Override: use var('target_schema') as absolute schema
    normalize_date.sql                   # SAFE.PARSE_DATE, SAFE_CAST to DATE
    normalize_types.sql                  # safe_cast_float, safe_cast_int, safe_cast_string
    dedup_by_key.sql                     # ROW_NUMBER() OVER (PARTITION BY keys ORDER BY _fivetran_synced DESC)
  models/
    staging/
      api/
        stg_facebook_ads.sql             # JOIN insights + regions, region % fanout
        stg_facebook_ads.yml
        stg_google_ads.sql
        stg_google_ads.yml
      file_upload/
        stg_gcs_upload.sql               # Dedup by key columns (passed as var)
        stg_gcs_upload.yml
      file_system/
        stg_sftp.sql                     # Keep rows from active files only (_file + _fivetran_synced)
        stg_sftp.yml
      db/
        stg_postgres.sql                 # WHERE _fivetran_deleted = false
        stg_postgres.yml
      passthrough/
        stg_passthrough.sql              # SELECT * (type normalization only)
        stg_passthrough.yml
```

### How dynamic schemas work

Each dbt invocation receives `--vars '{"target_schema": "<fivetran_schema>", "bq_project": "...", "source_table": "..."}'`. The `generate_schema_name` macro returns `var('target_schema')`, so the output table lands in the Fivetran schema alongside raw tables.

### Category-specific model patterns

**API** (`stg_facebook_ads.sql`): Hard-coded table references within the schema (the model knows which tables to join). Uses LEFT JOIN, SAFE_DIVIDE for regional fanout, normalize_date for dates.

**DB** (`stg_postgres.sql`): Receives `source_table` as var. Filters `_fivetran_deleted = false`. Strips Fivetran metadata columns.

**File System** (`stg_sftp.sql`): Receives `source_table` as var. Finds the latest `_fivetran_synced` timestamp, identifies `_file` values present in that sync window, keeps only rows from those active files.

**File Upload** (`stg_gcs_upload.sql`): Receives `source_table` and `dedup_keys` as vars. Uses the `dedup_by_key` macro (ROW_NUMBER partitioned by keys, keep latest per `_fivetran_synced`).

**Passthrough** (`stg_passthrough.sql`): Receives `source_table` as var. `SELECT *` — just creates the staging table for consistency.

## Transform Registry

### Pipeline: `pipeline/src/izakaya_pipeline/transforms/__init__.py`

```python
class ConnectorCategory(str, Enum):
    API = "api"
    FILE_UPLOAD = "file_upload"
    FILE_SYSTEM = "file_system"
    DB = "db"
    PASSTHROUGH = "passthrough"

@dataclass
class TransformConfig:
    service: str                       # Fivetran service ID
    category: ConnectorCategory
    dbt_model: str                     # dbt model to --select
    staging_table: str                 # Output table name (= dbt alias)
    display_name: str
    requires_table_selection: bool     # False for API/file_upload (auto-determined)
    dedup_key_source: str = ""         # "dataset_type" → derive keys from required cols

TRANSFORM_REGISTRY = {
    "facebook_ads": TransformConfig(..., category=API, dbt_model="stg_facebook_ads", requires_table_selection=False),
    "google_ads":   TransformConfig(..., category=API, dbt_model="stg_google_ads", requires_table_selection=False),
    "postgres":     TransformConfig(..., category=DB, dbt_model="stg_postgres", requires_table_selection=True),
    "mysql":        TransformConfig(..., category=DB, dbt_model="stg_mysql", requires_table_selection=True),
    "sftp":         TransformConfig(..., category=FILE_SYSTEM, dbt_model="stg_sftp", requires_table_selection=True),
    "s3":           TransformConfig(..., category=FILE_SYSTEM, dbt_model="stg_s3", requires_table_selection=True),
    "gcs":          TransformConfig(..., category=FILE_UPLOAD, dbt_model="stg_gcs_upload", requires_table_selection=False, dedup_key_source="dataset_type"),
}
# Falls back to passthrough for unknown services
```

### Backend mirror: `backend/src/izakaya_api/services/transforms.py`

Lightweight copy — just `service → category`, `service → staging_table`, `service → requires_table_selection`. No dbt details.

## Dagster Changes

### New asset: `pipeline/src/izakaya_pipeline/assets/transform.py`

`dbt_staging` asset, partitioned by `connector_id`:
1. Load connector's `service`, `schema_name` from DB
2. Get `TransformConfig` from registry
3. Build dbt vars: `target_schema`, `bq_project`, `source_table` (from `raw_table`), `dedup_keys` (if file upload)
4. `subprocess.run(["dbt", "run", "--select", model, "--vars", vars_json, "--full-refresh"])`
5. On success: `INSERT INTO pipeline_runs (status='pending')` for each mapped data source on this connector

### New job in `definitions.py`

```python
transform_job = define_asset_job("transform_job", selection=[dbt_staging], partitions_def=connector_partitions)
```

### Modified `fivetran_sync_sensor`

Changes from `job_name="etl_asset_job"` to `job_name="transform_job"`. Yields `RunRequest(partition_key=connector_id)` instead of inserting PipelineRun directly. Query changes to `SELECT DISTINCT c.id` (connector-level, not data-source-level).

### New `pending_transform_sensor`

Picks up `PipelineRun(status='pending_transform')` records (created by manual retransform endpoint). Triggers `transform_job` for the corresponding connector. After dbt completes, the `dbt_staging` asset handles upgrading to `PipelineRun(status='pending')`.

### Initial setup flow

When a DataSource is first created on a connector that has `sync_state='synced'`, the backend creates a `PipelineRun(status='pending_transform')`. This ensures dbt runs and creates the staging table before the user tries to map columns. The `get_source_columns` endpoint reads from the staging table.

## Backend Changes

### New column: `DataSource.raw_table` (nullable String)

Stores the user's original table selection (e.g., `orders` for a Postgres connector). `bq_table` is always set to the staging table name (`stg_postgres`). The pipeline reads `raw_table` to pass as `source_table` dbt var.

- **API connectors**: `raw_table = NULL` (dbt model hard-codes its source tables), `bq_table = 'stg_facebook_ads'`
- **DB/FS/passthrough**: `raw_table = user's selection`, `bq_table = 'stg_postgres'`
- **File upload**: `raw_table = NULL`, `bq_table = 'stg_gcs_upload'`

### New column: `Connector.connector_category` (String, default='passthrough')

Set on connector creation/finalize from `get_connector_category(service)`.

### Schema changes

- `DataSourceCreate.bq_table` → optional (`str | None = None`)
- `DataSourceResponse` → add `raw_table`, `connector_category`
- `ConnectorResponse` → add `connector_category`, `requires_table_selection`

### Updated `create_data_source`

```
if requires_table_selection(service):
    raw_table = body.bq_table  (required)
else:
    raw_table = None
bq_table = get_staging_table(service)  # always staging
```

If connector has `sync_state='synced'`, also create `PipelineRun(status='pending_transform')` to trigger initial dbt run.

### New endpoint: `POST /connectors/{id}/retransform`

Creates `PipelineRun(status='pending_transform')` for each mapped data source. Picked up by `pending_transform_sensor`.

### Alembic migration

1. Add `connector_category` to `connectors` (server_default='passthrough')
2. Add `raw_table` to `data_sources` (nullable)
3. Backfill `connector_category` from known service types
4. For existing data sources on known connector types: copy `bq_table` to `raw_table`, update `bq_table` to staging name

## Frontend Changes

### Data source creation

- When connector has `requires_table_selection = false`: hide BQ table picker, show info banner
- When `requires_table_selection = true`: existing table picker (unchanged)

### Connector detail page

- Category badge (API, DB, File System, etc.)
- "Re-run Transform" button → `POST /api/connectors/{id}/retransform`

### Data source detail

- Show `raw_table → bq_table` (e.g., "orders → stg_postgres") where applicable
- "Transformed" badge

## Implementation Phases

### Phase 1: Pipeline foundation
- Add `dagster-dbt`, `dbt-bigquery` to `pipeline/pyproject.toml`
- Create `pipeline/dbt/` project (config, profiles, macros)
- Create `stg_passthrough.sql` (simplest model first)
- Create transform registry (`transforms/__init__.py`)
- Create `dbt_staging` asset + `transform_job`
- Test: run passthrough against existing connector

### Phase 2: Sensor rewiring
- Modify `fivetran_sync_sensor` → trigger `transform_job`
- Add `pending_transform_sensor`
- Test: Fivetran sync → dbt passthrough → ETL

### Phase 3: Backend API
- Add `connector_category`, `raw_table` columns + migration
- Create `services/transforms.py`
- Update `create_data_source`, connector/data source schemas
- Add `POST /connectors/{id}/retransform`

### Phase 4: Category-specific dbt models
- `stg_facebook_ads.sql` (API)
- `stg_google_ads.sql` (API)
- `stg_postgres.sql` (DB)
- `stg_sftp.sql` (File System)
- `stg_gcs_upload.sql` (File Upload)

### Phase 5: Frontend
- Conditional table picker
- Retransform button
- Category badges

## Files to Create

| File | Purpose |
|------|---------|
| `pipeline/dbt/dbt_project.yml` | dbt project config |
| `pipeline/dbt/profiles.yml` | BQ connection |
| `pipeline/dbt/macros/generate_schema_name.sql` | Absolute schema override |
| `pipeline/dbt/macros/normalize_date.sql` | Date parsing macro |
| `pipeline/dbt/macros/normalize_types.sql` | Type casting macros |
| `pipeline/dbt/macros/dedup_by_key.sql` | Dedup macro |
| `pipeline/dbt/models/staging/api/stg_facebook_ads.sql` | Meta Ads transform |
| `pipeline/dbt/models/staging/api/stg_google_ads.sql` | Google Ads transform |
| `pipeline/dbt/models/staging/db/stg_postgres.sql` | DB soft-delete filter |
| `pipeline/dbt/models/staging/file_system/stg_sftp.sql` | File orphan removal |
| `pipeline/dbt/models/staging/file_upload/stg_gcs_upload.sql` | File dedup |
| `pipeline/dbt/models/staging/passthrough/stg_passthrough.sql` | Passthrough |
| `pipeline/src/izakaya_pipeline/transforms/__init__.py` | Transform registry |
| `pipeline/src/izakaya_pipeline/assets/transform.py` | dbt_staging Dagster asset |
| `backend/src/izakaya_api/services/transforms.py` | Backend registry mirror |
| `backend/migrations/versions/xxxx_add_transform_columns.py` | Migration |

## Files to Modify

| File | Change |
|------|--------|
| `pipeline/pyproject.toml` | Add dagster-dbt, dbt-bigquery |
| `pipeline/src/izakaya_pipeline/definitions.py` | Add transform_job, dbt_staging, pending_transform_sensor |
| `pipeline/src/izakaya_pipeline/sensors.py` | Rewrite fivetran_sync_sensor, add pending_transform_sensor |
| `pipeline/src/izakaya_pipeline/assets/__init__.py` | Export dbt_staging |
| `backend/src/izakaya_api/models/data_source.py` | Add raw_table column |
| `backend/src/izakaya_api/models/connector.py` | Add connector_category column |
| `backend/src/izakaya_api/models/__init__.py` | Update exports |
| `backend/src/izakaya_api/schemas/data_source.py` | Optional bq_table, add raw_table + connector_category |
| `backend/src/izakaya_api/schemas/connector.py` | Add connector_category, requires_table_selection |
| `backend/src/izakaya_api/routers/data_sources.py` | Auto-set bq_table, trigger initial transform |
| `backend/src/izakaya_api/routers/connectors.py` | Add retransform endpoint |
| `frontend/src/app/(app)/datasets/[id]/page.tsx` | Conditional table picker |
| `frontend/src/app/(app)/connectors/[id]/page.tsx` | Category badge, retransform button |

## Adding New Connectors (future)

1. Pick the category (API, DB, FILE_SYSTEM, FILE_UPLOAD, or PASSTHROUGH)
2. Create a dbt model in the appropriate directory (or reuse existing if same category + same pattern)
3. Add entry to `TRANSFORM_REGISTRY` in pipeline
4. Add entry to backend `services/transforms.py`
5. No sensor, ETL, or frontend changes needed

## Verification

1. **Passthrough**: Run dbt manually for an existing connector → verify staging table created → verify ETL reads from it
2. **API**: Fivetran sync for Meta Ads → dbt joins tables → staging table has correct schema → ETL maps from it
3. **DB**: Soft-deleted rows in source → filtered out in staging → absent from datamart
4. **File System**: Delete a source file → next sync + dbt run → orphaned rows removed from staging
5. **API**: Create data source for API connector → verify `bq_table` auto-set, `raw_table` is null
6. **Frontend**: Connector with `requires_table_selection=false` → table picker hidden
