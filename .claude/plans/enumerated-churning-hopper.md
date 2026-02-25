# Pipeline Architecture: Universal dbt Normalization Layer

## Context

The app needs to support multiple Fivetran connector types, each with different data challenges. We add a universal dbt layer between Fivetran and ETL — every connector passes through a dbt model that normalizes data before the existing ETL (map → label → datamart) runs.

## 3 Connector Categories

| Category | Problem | dbt Solution | Examples |
|----------|---------|-------------|---------|
| **API** | Multiple tables per connector | JOIN into single staging table | Meta Ads, Google Ads |
| **File System** | Deleted source files leave orphaned rows in BQ | Keep only rows from active files (`_file` + `_fivetran_synced`) | SFTP, S3, GCS (incl. manual uploads) |
| **Database** | Fivetran soft-deletes via `_fivetran_deleted` | `WHERE _fivetran_deleted = false` | Postgres, MySQL |

Manual file uploads flow into the **File System** category: user uploads to a GCS bucket → Fivetran GCS connector picks it up → same dbt model handles orphan detection.

All models also normalize types (date parsing, safe casts, null handling). Unknown connector types use a **passthrough** model.

## Data Flow

```
Fivetran Sync
  → fivetran_sync_sensor (detects sync_state='synced')
  → transform_job (dbt_staging asset)
      1. Look up connector service + schema_name
      2. dbt run --select {model} --vars {target_schema, bq_project, ...} --full-refresh
      3. Output: {fivetran_schema}.stg_{service}
      4. Insert PipelineRun(status='pending') for mapped data sources
  → pending_run_sensor (unchanged)
  → etl_asset_job (mapped → labelled → datamart, unchanged)
```

**Key design:** dbt writes output into the Fivetran connector's own BQ schema via a custom `generate_schema_name` macro. `DataSource.bq_table = 'stg_{service}'`. The ETL reads `{schema_name}.{bq_table}` — **zero ETL code changes**.

**Table selection:** API and File System connectors auto-detect their table names (API models hard-code source tables; File System tables are fetched from Fivetran's schema API after setup). Only Database connectors require the user to pick a table (since they often sync many tables).

---

## dbt Project

### Structure

```
pipeline/dbt/
  dbt_project.yml                        # materialized: table (full refresh always)
  profiles.yml                           # BQ connection from env vars
  macros/
    generate_schema_name.sql             # Use var('target_schema') as absolute BQ dataset
    normalize_date.sql                   # SAFE.PARSE_DATE, SAFE_CAST to DATE
    normalize_types.sql                  # safe_cast_float, safe_cast_int, safe_cast_string
  models/
    staging/
      api/
        stg_facebook_ads.sql             # JOIN insights tables, region % fanout, normalize
        stg_facebook_ads.yml
        stg_google_ads.sql
        stg_google_ads.yml
      file_system/
        stg_file_system.sql              # Orphan removal: keep rows from active _file values
        stg_file_system.yml
      db/
        stg_database.sql                 # WHERE _fivetran_deleted = false
        stg_database.yml
      passthrough/
        stg_passthrough.sql              # SELECT * (normalize types only)
        stg_passthrough.yml
```

### Key macro: `generate_schema_name.sql`

```sql
{% macro generate_schema_name(custom_schema_name, node) -%}
    {%- if var('target_schema', none) is not none -%}
        {{ var('target_schema') }}
    {%- elif custom_schema_name is not none -%}
        {{ custom_schema_name }}
    {%- else -%}
        {{ target.dataset }}
    {%- endif -%}
{%- endmacro %}
```

Invoked as `dbt run --vars '{"target_schema": "meta_ads_abc123"}'` → output lands in the Fivetran schema.

### Model patterns

**API** (`stg_facebook_ads.sql`): Hard-coded source table references. JOINs multiple tables, applies regional fanout with SAFE_DIVIDE, normalizes dates/types.

**File System** (`stg_file_system.sql`): Receives `source_table` var. Finds max `_fivetran_synced`, identifies `_file` values present in latest sync window, INNER JOINs to keep only active rows.

**Database** (`stg_database.sql`): Receives `source_table` var. Filters `WHERE _fivetran_deleted = false`. Strips `_fivetran_*` metadata columns.

**Passthrough** (`stg_passthrough.sql`): Receives `source_table` var. `SELECT *` for consistency.

---

## Transform Registry

### Pipeline: `pipeline/src/izakaya_pipeline/transforms/registry.py`

```python
class ConnectorCategory(str, Enum):
    API = "api"
    FILE_SYSTEM = "file_system"
    DB = "db"
    PASSTHROUGH = "passthrough"

@dataclass
class TransformConfig:
    service: str                       # Fivetran service ID
    category: ConnectorCategory
    dbt_model: str                     # dbt model to --select
    staging_table: str                 # Output table alias
    display_name: str
    requires_table_selection: bool     # True only for DB connectors

TRANSFORM_REGISTRY = {
    # API — no table selection, dbt model knows source tables
    "facebook_ads": TransformConfig("facebook_ads", API, "stg_facebook_ads", "stg_facebook_ads", "Meta Ads", False),
    "google_ads":   TransformConfig("google_ads", API, "stg_google_ads", "stg_google_ads", "Google Ads", False),

    # File System — no table selection, auto-detect from Fivetran schema API
    "sftp":         TransformConfig("sftp", FILE_SYSTEM, "stg_file_system", "stg_file_system", "SFTP", False),
    "s3":           TransformConfig("s3", FILE_SYSTEM, "stg_file_system", "stg_file_system", "S3", False),
    "gcs":          TransformConfig("gcs", FILE_SYSTEM, "stg_file_system", "stg_file_system", "GCS", False),

    # Database — user selects table (DB connectors sync many tables)
    "postgres":     TransformConfig("postgres", DB, "stg_database", "stg_database", "PostgreSQL", True),
    "mysql":        TransformConfig("mysql", DB, "stg_database", "stg_database", "MySQL", True),
}
# Falls back to passthrough for unknown services
```

Note: File System and Database connectors share a single dbt model each (`stg_file_system`, `stg_database`), parameterized via `source_table` var. API connectors get service-specific models since each has unique join logic.

### Backend mirror: `backend/src/izakaya_api/domains/connectors/transform_config.py`

Lightweight copy — `service → category`, `service → staging_table`, `service → requires_table_selection`. No dbt details. Follows domain structure.

---

## Dagster Changes

### New asset: `pipeline/src/izakaya_pipeline/assets/dbt_staging.py`

Partitioned by `connector_id`. Uses `DynamicPartitionsDefinition("connector_id")` (new, separate from existing `data_source_id` partitions).

1. Query connector's `service`, `schema_name` from DB via `data_source_repo`
2. Look up `TransformConfig` from registry
3. Build dbt vars: `target_schema` (= schema_name), `bq_project`, `source_table` (from `raw_table` for DB/FS)
4. `subprocess.run(["dbt", "run", "--select", model, "--vars", ..., "--full-refresh", "--project-dir", ..., "--profiles-dir", ...])`
5. On success: insert `PipelineRun(status='pending')` for each mapped data source via `pipeline_run_repo`
6. Has `RetryPolicy(max_retries=2, delay=30)` per pipeline conventions

### New job in `definitions.py`

```python
transform_job = define_asset_job("transform_job", selection=[dbt_staging], partitions_def=connector_partitions)
```

### Modified `sensors/fivetran_sync_sensor.py`

Current: `job_name="etl_asset_job"`, inserts PipelineRun directly.
New: `job_name="transform_job"`, yields `RunRequest(partition_key=str(connector_id))`. Query changes to `SELECT DISTINCT c.id` (connector-level).

### New `sensors/pending_transform_sensor.py`

Picks up `PipelineRun(status='pending_transform')` (from manual retransform or initial data source creation). Groups by connector, triggers `transform_job`. Updates status to `'pending'` after dbt completes (handled by `dbt_staging` asset).

### Initial setup flow

When a DataSource is created on a connector with `sync_state='synced'`, the backend service creates a `PipelineRun(status='pending_transform')`. This ensures dbt runs and the staging table exists before the user maps columns.

---

## Backend Changes

### New column: `DataSource.raw_table` (nullable)

Stores the user's original table selection. `bq_table` always points to the staging table.

| Category | `raw_table` | `bq_table` |
|----------|------------|-----------|
| API | `NULL` (dbt hard-codes sources) | `stg_facebook_ads` |
| File System | auto-detected from Fivetran | `stg_file_system` |
| Database | user-selected | `stg_database` |

### New column: `Connector.connector_category` (default='passthrough')

Set from service type on connector creation/finalize.

### Auto-detect table for File System connectors

In `domains/connectors/service.py`, after connector finalize (when Fivetran setup completes): call Fivetran's `GET /v1/connectors/{id}/schemas` to discover table names. Store the detected table. When a DataSource is later created on this connector, `raw_table` is auto-set from this.

### Schema changes (in `domains/data_sources/schemas.py` and `domains/connectors/schemas.py`)

- `DataSourceCreate.bq_table` → optional (`str | None = None`)
- `DataSourceResponse` → add `raw_table`, `connector_category`
- `ConnectorResponse` → add `connector_category`, `requires_table_selection`

### Updated `create_data_source` (in `domains/data_sources/service.py`)

```
config = get_transform_config(connector.service)
if config.requires_table_selection:
    raw_table = body.bq_table  # required, validated
else:
    raw_table = connector.detected_table or None  # auto-detected for FS
bq_table = config.staging_table

# If connector already synced, trigger initial dbt run
if connector.sync_state == 'synced':
    create PipelineRun(status='pending_transform')
```

### New endpoint: `POST /connectors/{id}/retransform`

In `domains/connectors/router.py`. Creates `PipelineRun(status='pending_transform')` for each mapped data source. Service layer validates connector exists and has mapped sources.

### Alembic migration

1. Add `connector_category` to `connectors` (server_default='passthrough')
2. Add `raw_table` to `data_sources` (nullable)
3. Backfill `connector_category` from known service types
4. For existing data sources: copy `bq_table` → `raw_table`, set `bq_table` to staging name

---

## Frontend Changes

- **Data source creation**: when `requires_table_selection = false` → hide table picker, show info banner ("Source tables are detected automatically")
- **Connector detail**: category badge + "Re-run Transform" button (`POST /api/connectors/{id}/retransform`)
- **Data source detail**: show `raw_table → bq_table` where applicable

---

## Implementation Phases

| Phase | Scope |
|-------|-------|
| **1. dbt project** | `pipeline/dbt/` — config, profiles, macros, `stg_passthrough` model |
| **2. Registry + asset** | `transforms/registry.py`, `assets/dbt_staging.py`, `transform_job` in `definitions.py` |
| **3. Sensor rewiring** | Modify `fivetran_sync_sensor`, add `pending_transform_sensor` |
| **4. Backend** | New columns + migration, `transform_config.py`, service/schema/router changes, retransform endpoint |
| **5. API models** | `stg_facebook_ads.sql`, `stg_google_ads.sql` |
| **6. Category models** | `stg_file_system.sql`, `stg_database.sql` |
| **7. Frontend** | Conditional table picker, retransform button, category badges |

## Files to Create

| File | Purpose |
|------|---------|
| `pipeline/dbt/dbt_project.yml` | dbt project config |
| `pipeline/dbt/profiles.yml` | BQ connection |
| `pipeline/dbt/macros/generate_schema_name.sql` | Absolute schema override |
| `pipeline/dbt/macros/normalize_date.sql` | Date parsing |
| `pipeline/dbt/macros/normalize_types.sql` | Type casting |
| `pipeline/dbt/models/staging/api/stg_facebook_ads.sql` | Meta Ads join |
| `pipeline/dbt/models/staging/api/stg_google_ads.sql` | Google Ads join |
| `pipeline/dbt/models/staging/file_system/stg_file_system.sql` | Orphan removal |
| `pipeline/dbt/models/staging/db/stg_database.sql` | Soft-delete filter |
| `pipeline/dbt/models/staging/passthrough/stg_passthrough.sql` | Passthrough |
| `pipeline/src/izakaya_pipeline/transforms/registry.py` | Transform registry |
| `pipeline/src/izakaya_pipeline/assets/dbt_staging.py` | dbt_staging Dagster asset |
| `pipeline/src/izakaya_pipeline/sensors/pending_transform_sensor.py` | Manual retransform sensor |
| `backend/src/izakaya_api/domains/connectors/transform_config.py` | Backend registry mirror |

## Files to Modify

| File | Change |
|------|--------|
| `pipeline/pyproject.toml` | Add `dagster-dbt`, `dbt-bigquery` |
| `pipeline/src/izakaya_pipeline/definitions.py` | Add transform_job, dbt_staging, pending_transform_sensor |
| `pipeline/src/izakaya_pipeline/sensors/fivetran_sync_sensor.py` | Route to transform_job |
| `pipeline/src/izakaya_pipeline/assets/__init__.py` | Export dbt_staging |
| `backend/src/izakaya_api/domains/data_sources/models.py` | Add `raw_table` |
| `backend/src/izakaya_api/domains/connectors/models.py` | Add `connector_category` |
| `backend/src/izakaya_api/domains/data_sources/schemas.py` | Optional bq_table |
| `backend/src/izakaya_api/domains/connectors/schemas.py` | Add category, requires_table_selection |
| `backend/src/izakaya_api/domains/data_sources/service.py` | Auto-set bq_table/raw_table |
| `backend/src/izakaya_api/domains/connectors/service.py` | Detect tables from Fivetran, retransform |
| `backend/src/izakaya_api/domains/connectors/router.py` | Retransform endpoint |
| `frontend/src/app/(app)/datasets/[id]/page.tsx` | Conditional table picker |
| `frontend/src/app/(app)/connectors/[id]/page.tsx` | Category badge, retransform button |

## Adding New Connectors (future)

1. Determine category (API, File System, DB, or passthrough)
2. For API: create a service-specific dbt model. For FS/DB: reuse `stg_file_system` or `stg_database`
3. Add entry to pipeline `TRANSFORM_REGISTRY` + backend mirror
4. No sensor, ETL, or frontend changes needed
