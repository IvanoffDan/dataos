# Data Normalization System — Design & Implementation Plan

## Context

Izakaya currently supports only GCS connectors. API connectors (Meta Ads, Google Ads) and database connectors (Snowflake, Postgres) are coming soon. The primary normalization challenge is **date formats**: file-based connectors deliver dates as raw strings in arbitrary formats (DD/MM/YYYY, MM/DD/YYYY, "Jan 15, 2024", etc.), and different CSV uploads to the same connector can use different formats. The existing validation in `datamart` (validation.py:135-157) only tries one hardcoded format + ISO fallback — everything else fails.

**Goal**: A zero-touch, three-tier normalization system that auto-detects and normalizes date formats to `YYYY-MM-DD` and coerces pure-number STRING columns to numeric types before data enters the mapping pipeline. Smart enough to disambiguate DD/MM vs MM/DD statistically. Ambiguous format detections are overridable from the UI. No over-normalization beyond dates and numerics.

## Architecture Overview

```
                   FIVETRAN SYNC COMPLETES
                           |
              +------------+------------+
              |                         |
         API connector           FS / DB connector
              |                         |
     Tier 2: dbt model          Tier 3: Auto-detect
     (deterministic per         (statistical format
      connector type)            detection + BQ PARSE_DATE)
              |                         |
              |                  profile_source (Dagster asset)
              |                    - sample STRING columns
              |                    - detect date format per file
              |                    - detect numeric types
              |                    - store in Postgres
              |                         |
              |                  normalized_source (Dagster asset)
              |                    - SAFE.PARSE_DATE(detected_fmt, col) per file
              |                    - SAFE_CAST for numeric columns
              |                    - writes {table}_normalized in BQ
              |                    - preserves __raw_{col} for audit
              |                         |
              +------------+------------+
                           |
                    mapped_dataset (existing, modified)
                      reads from: dbt staging / _normalized / raw
                           |
                    labelled_dataset (existing, unchanged)
                           |
                    datamart (existing, date validation simplified)
```

---

## 1. Connector Category Registry

**New file**: `backend/src/izakaya_api/core/connector_categories.py`

Static mapping of Fivetran `service` → category:

| Category     | Services                                                                 |
|-------------|--------------------------------------------------------------------------|
| `api`        | facebook_ads, google_ads, google_analytics_4, tiktok_ads, linkedin_ads, shopify, stripe, hubspot, etc. |
| `filesystem` | google_cloud_storage, s3, azure_blob_storage, sftp, ftp, dropbox, box    |
| `database`   | postgres, mysql, snowflake_db, sql_server, oracle, redshift              |
| `native`     | Default fallback for unknown services (no normalization, trust Fivetran) |

```python
class ConnectorCategory(str, Enum):
    API = "api"
    FILESYSTEM = "filesystem"
    DATABASE = "database"
    NATIVE = "native"

def get_connector_category(service: str) -> ConnectorCategory: ...
```

**DB change**: Add `connector_category` column to `connectors` table. Set on creation via `get_connector_category(service)`.

---

## 2. Date Format Detection Algorithm

**New module**: `pipeline/src/izakaya_pipeline/normalization/date_detection.py`

### Candidate formats (priority order)
```
%Y-%m-%d        2024-01-15        (ISO, unambiguous)
%Y/%m/%d        2024/01/15
%Y%m%d          20240115
%d/%m/%Y        15/01/2024        (AU/UK/EU)
%d-%m-%Y        15-01-2024
%d.%m.%Y        15.01.2024
%d %b %Y        15 Jan 2024
%d %B %Y        15 January 2024
%b %d, %Y       Jan 15, 2024
%B %d, %Y       January 15, 2024
%m/%d/%Y        01/15/2024        (US)
%m-%d-%Y        01-15-2024
+ timestamp variants (%Y-%m-%d %H:%M:%S, ISO 8601 with T, etc.)
```

### Detection flow
1. Sample up to 1,000 distinct non-null values from BQ
2. Try each candidate format — keep formats with >= 95% parse success
3. **DD/MM vs MM/DD disambiguation**: scan all values for parts > 12
   - If any value has first part > 12 → DD/MM confirmed
   - If any value has second part > 12 → MM/DD confirmed
   - If contradictory → error (mixed formats in data)
   - If all ambiguous (both parts <= 12) → default to DD/MM (AU locale), flag as `ambiguous=True`, confidence=LOW
4. **Excel serial dates**: if all values are 5-digit integers in [1, 100000], detect as Excel serial and convert via `DATE_ADD(DATE '1899-12-30', INTERVAL value DAY)`

### Per-file profiling (critical for FS connectors)

Fivetran FS connectors add `_fivetran_file` (source file path) and `_fivetran_modified` (file timestamp) metadata columns to every row. Different CSV uploads may use different date formats. Instead of trying to find one format for the whole column, we **profile per file**.

**Per-file detection flow**:
5. For FS connectors, group sampled values by `_fivetran_file`
6. Run the detection algorithm (steps 1-4) independently per file
7. Each file gets its own `ColumnDetectionResult` with its own detected format
8. Store one `source_column_profiles` row **per file per column** (keyed by `data_source_id + column_name + fivetran_file`)

**Normalization SQL uses CASE WHEN per file**:
```sql
CASE
  WHEN _fivetran_file = 'gs://bucket/agency_a/2024.csv'
    THEN SAFE.PARSE_DATE('%d/%m/%Y', date_col)
  WHEN _fivetran_file = 'gs://bucket/agency_b/2024.csv'
    THEN SAFE.PARSE_DATE('%Y-%m-%d', date_col)
  ELSE
    -- Fallback: cascading COALESCE for unknown/new files
    COALESCE(
      SAFE.PARSE_DATE('%Y-%m-%d', date_col),
      SAFE.PARSE_DATE('%d/%m/%Y', date_col)
    )
END AS date_col,
date_col AS __raw_date_col
```

**Benefits**:
- No ambiguity between files — each file's format is detected independently
- New files that arrive get profiled on the next sync
- Format drift is tracked per file, not per column
- The `ELSE` fallback uses a cascading COALESCE (unambiguous formats first) for any files not yet profiled

**Fallback COALESCE ordering** (for unprofiled files or DB connectors without `_fivetran_file`):
1. ISO formats first (`%Y-%m-%d`) — always unambiguous
2. Named-month formats (`%d %b %Y`, `%b %d, %Y`) — also unambiguous
3. Statistically dominant numeric format from overall column profiling
4. Less common formats last

For **database connectors** (no `_fivetran_file`), fall back to whole-column profiling with cascading COALESCE as described above.

### Smart column pre-filtering (zero-touch)
Not all STRING columns are dates. Before full profiling, a fast heuristic filter:
1. Column name heuristic: contains "date", "time", "day", "created", "updated", "start", "end", "period", "_at", "_on"
2. Quick sample (10 values): try parsing against top 5 formats. If >= 7/10 parse, proceed to full detection
3. This avoids expensive profiling of clearly non-date STRING columns

### Output
```python
@dataclass
class ColumnDetectionResult:
    column_name: str
    fivetran_file: str | None     # NULL for DB connectors
    detected_type: str            # "date", "integer", "float", "string" (original)
    detected_format: str | None   # BQ PARSE_DATE format string (dates only)
    python_format: str | None     # strptime format string (dates only)
    confidence: str               # "high", "medium", "low", "none"
    ambiguous: bool
    sample_size: int
    error_rate: float
    detection_error: str | None
```

---

## 2b. Numeric Type Detection

**Also in**: `pipeline/src/izakaya_pipeline/normalization/type_detection.py`

For STRING columns that aren't dates, detect if they contain only numbers:

1. Sample up to 1,000 distinct non-null values
2. **Integer detection**: try `int(value)` on all values. If >= 95% succeed → `detected_type = "integer"`
3. **Float detection**: try `float(value)` on all values. If >= 95% succeed → `detected_type = "float"`
4. Check for common numeric patterns: currency prefixes/suffixes (`$100`, `100.00%`), thousand separators (`1,000.50`)
   - Strip `$`, `%`, `,` before parsing
   - Store the cleaning pattern in the profile so normalization can replicate it

Normalization SQL for numerics:
```sql
SAFE_CAST(REGEXP_REPLACE(col, r'[$,%]', '') AS FLOAT64) AS col
```

**Not coerced**: Columns that look numeric but are identifiers (e.g., ZIP codes "02101", phone numbers). Heuristic: if values have leading zeros, treat as STRING (preserve).

---

## 2c. Format Override (UI-configurable)

When format detection is ambiguous (`ambiguous=True` or `confidence=LOW`), users can override the detected format from the data source detail page.

**New field on `source_column_profiles`**:
```sql
user_override_format VARCHAR(100),      -- User-selected format, takes precedence
overridden_at        TIMESTAMPTZ
```

**New endpoint**: `PATCH /api/data-sources/{id}/column-profiles/{profile_id}`
- Body: `{ "override_format": "DD/MM/YYYY" }`
- Sets `user_override_format`, triggers re-normalization on next pipeline run

**Normalization priority**: `user_override_format` > `detected_format` > skip

---

## 3. New Database Tables

### `source_column_profiles`
```sql
CREATE TABLE source_column_profiles (
    id              SERIAL PRIMARY KEY,
    data_source_id  INTEGER NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
    column_name     VARCHAR(255) NOT NULL,
    fivetran_file   VARCHAR(1000),      -- NULL for DB connectors, set for FS connectors (per-file profiling)
    detected_type   VARCHAR(20) NOT NULL DEFAULT 'string',  -- 'date', 'integer', 'float', 'string'
    detected_format VARCHAR(100),       -- BQ format string or "NATIVE" or "EXCEL_SERIAL"
    python_format   VARCHAR(100),       -- Python strptime format
    confidence      VARCHAR(10) NOT NULL DEFAULT 'none',
    ambiguous       BOOLEAN NOT NULL DEFAULT FALSE,
    sample_size     INTEGER NOT NULL DEFAULT 0,
    error_rate      FLOAT NOT NULL DEFAULT 0,
    bq_source_type  VARCHAR(50),        -- Original BQ type (STRING, DATE, etc.)
    detection_error VARCHAR(500),
    -- User override (takes precedence over auto-detection)
    user_override_format VARCHAR(100),
    overridden_at   TIMESTAMPTZ,
    -- Numeric cleaning pattern (e.g., "strip_currency", "strip_percent")
    cleaning_pattern VARCHAR(100),
    profiled_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (data_source_id, column_name, COALESCE(fivetran_file, '__all__'))
);
```

### `profile_drift_alerts`
```sql
CREATE TABLE profile_drift_alerts (
    id                  SERIAL PRIMARY KEY,
    data_source_id      INTEGER NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
    column_name         VARCHAR(255) NOT NULL,
    fivetran_file       VARCHAR(1000),
    previous_format     VARCHAR(100),
    new_format          VARCHAR(100),
    previous_confidence VARCHAR(10),
    new_confidence      VARCHAR(10),
    alert_type          VARCHAR(50) NOT NULL,  -- 'format_changed', 'confidence_degraded', 'detection_failed'
    resolved            BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 4. New Dagster Assets

### `profile_source` (runs independently, triggered by sync)

- **Partition**: by `data_source_id`
- **Trigger**: new `profile_source_sensor` (detects synced FS/DB connectors with stale/missing profiles)
- **Logic**:
  1. Get BQ table columns for the data source
  2. Skip columns already typed as DATE/TIMESTAMP/DATETIME in BQ (mark as `format=NATIVE`)
  3. For FS connectors: query distinct `_fivetran_file` values, profile each file independently
  4. For STRING columns, run heuristic pre-filter → full date detection → numeric detection
  5. Upsert results into `source_column_profiles` (keyed by data_source_id + column_name + fivetran_file)
  6. Compare with previous profile → create drift alert if format changed
- **Key**: Runs after every sync, not tied to ETL runs. Profiles are always fresh.

### `normalized_source` (part of ETL job, before `mapped_dataset`)

- **Partition**: by `dataset_id` (same as existing ETL)
- **Logic**:
  1. For each data source in the dataset with `connector_category` in (filesystem, database):
     - Read `source_column_profiles` for all profiled columns
     - For date columns:
       - If user override set: `SAFE.PARSE_DATE('{override}', {col})`
       - If FS connector with per-file profiles: `CASE WHEN _fivetran_file = '...' THEN SAFE.PARSE_DATE(...)` per file
       - If DB connector with single format: `SAFE.PARSE_DATE('{format}', {col})`
       - ELSE fallback: cascading `COALESCE(SAFE.PARSE_DATE(fmt1, col), SAFE.PARSE_DATE(fmt2, col), ...)`
       - Always preserve original: `{col} AS __raw_{col}`
     - For numeric columns: `SAFE_CAST(REGEXP_REPLACE({col}, r'[$,%]', '') AS FLOAT64) AS {col}` (or INT64)
     - Write to `{schema}.{table}_normalized` in BQ
  2. For columns with `confidence=LOW` or `ambiguous=True`: still normalize but preserve `__raw_{col}` and log warning
  3. For columns with no detected format: pass through as-is
- **Output**: Normalized BQ table that `mapped_dataset` reads from instead of raw

---

## 5. Existing Asset Modifications

### `mapped_dataset` (etl.py:55-175)

Currently reads: `SELECT {cols} FROM {schema}.{bq_table}`

Modified to select the right source table:
- **Filesystem/Database connectors**: read from `{bq_table}_normalized` if it exists, else raw table
- **API connectors**: read from dbt staging table (e.g., `stg_meta_ads`) if it exists, else raw table
- **Native connectors**: read raw table (unchanged)

### `datamart` validation (validation.py:135-157)

Simplified — dates are already normalized upstream:
```python
elif data_type == "date":
    # Dates normalized upstream. Final safety check only.
    try:
        parsed = datetime.strptime(str_val, "%Y-%m-%d")
        clean[name] = parsed.strftime("%Y-%m-%d")
    except ValueError:
        errors.append({...})  # Upstream normalization missed this
```

---

## 6. dbt Layer (Tier 2 — API Connectors)

**Location**: `pipeline/dbt/`

```
pipeline/dbt/
  dbt_project.yml
  profiles.yml
  models/
    staging/
      _sources.yml          # Source definitions
      _staging.yml           # Schema tests (date NOT NULL, etc.)
      stg_meta_ads.sql       # First model (already designed previously)
      stg_google_ads.sql     # Future
  macros/
    parse_date_safe.sql      # Shared macro for SAFE.PARSE_DATE
```

Each API connector gets a deterministic dbt model. Dates are parsed with known formats per API (Meta Ads always sends `YYYY-MM-DD`, Google Ads uses `segments.date` which is already DATE, etc.).

**Dagster integration**: `dagster-dbt` asset that runs dbt models, passing dynamic `--vars` for schema names at runtime.

---

## 7. New Sensors

### `profile_source_sensor`
- Polls every 60s
- Finds data sources linked to FS/DB connectors where `sync_state='synced'` AND profile is missing or stale (profiled_at < succeeded_at)
- Yields `RunRequest` for `profile_job`

### Modified `fivetran_sync_sensor`
- No structural change, but the existing sensor already triggers ETL runs. The `normalized_source` asset (now part of the ETL job) handles the normalization step automatically.

---

## 8. Backend API Changes

### New endpoints (data_sources domain)
- `GET /api/data-sources/{id}/column-profiles` — view detected formats + types (grouped by file for FS connectors)
- `PATCH /api/data-sources/{id}/column-profiles/{profile_id}` — override detected format (sets `user_override_format`, triggers re-normalization on next pipeline run)
- `GET /api/data-sources/{id}/drift-alerts` — view unresolved drift alerts
- `POST /api/data-sources/{id}/drift-alerts/{alert_id}/resolve` — dismiss alert

### Modified `ConnectorResponse`
- Add `connector_category` field

---

## 9. Error Handling

| Scenario | Behavior |
|----------|----------|
| No single format reaches 95% threshold | Store `confidence=none`, skip normalization for that column/file. `datamart` catches bad dates. |
| DD/MM vs MM/DD fully ambiguous | Default DD/MM (AU locale), set `ambiguous=True`. User can override from UI. |
| Mixed formats across CSV files | Per-file profiling via `_fivetran_file` — each file gets its own detected format. No cross-file ambiguity. |
| New file appears between syncs | Profiled on next sync. Before profiling, ELSE branch in CASE WHEN uses cascading COALESCE fallback. |
| Format changes between syncs | Create drift alert. Use new format going forward. Don't block pipeline. |
| `SAFE.PARSE_DATE` returns NULL | Date becomes NULL. If required, caught by `datamart` validation. Original preserved in `__raw_` column. |
| BQ sampling fails | Profile asset fails. ETL falls back to raw table. |

---

## 10. Implementation Phases

### Phase 1: Foundation
1. Connector category registry module
2. Add `connector_category` column + Alembic migration
3. Backfill existing connectors
4. Create `source_column_profiles` + `profile_drift_alerts` tables

### Phase 2: Profiling Engine
5. Date format detection module (pure Python, extensive unit tests)
6. Numeric type detection module
7. `profile_source` Dagster asset (with per-file grouping for FS connectors)
8. `profile_source_sensor`
9. Backend API endpoints for profiles/alerts/overrides

### Phase 3: Normalization Pipeline
10. `normalized_source` Dagster asset (CASE WHEN per file for FS, COALESCE fallback for DB)
11. Modify `mapped_dataset` to read from normalized/dbt/raw tables
12. Simplify date validation in `datamart`
13. Integration tests

### Phase 4: dbt Layer
14. Initialize dbt project
15. `stg_meta_ads` model
16. Dagster-dbt integration
17. Future connector models as needed

### Phase 5: Observability
18. Dagster metadata on all new assets
19. Frontend UI for profiles/drift alerts/overrides (data source detail page)

---

## Critical Files to Modify

| File | Change |
|------|--------|
| `backend/src/izakaya_api/models/connector.py` | Add `connector_category` column |
| `backend/src/izakaya_api/domains/connectors/service.py` | Set category on create/finalize |
| `pipeline/src/izakaya_pipeline/assets/etl.py` | Add `normalized_source`, modify `mapped_dataset` table selection |
| `pipeline/src/izakaya_pipeline/assets/validation.py` | Simplify date validation |
| `pipeline/src/izakaya_pipeline/sensors.py` | Add `profile_source_sensor` |
| `pipeline/src/izakaya_pipeline/definitions.py` | Register new assets, jobs, sensors |

## New Files

| File | Purpose |
|------|---------|
| `backend/src/izakaya_api/core/connector_categories.py` | Category registry |
| `backend/src/izakaya_api/models/source_column_profile.py` | ORM model |
| `backend/src/izakaya_api/models/profile_drift_alert.py` | ORM model |
| `pipeline/src/izakaya_pipeline/normalization/__init__.py` | Normalization package |
| `pipeline/src/izakaya_pipeline/normalization/date_detection.py` | Date format detection algorithm |
| `pipeline/src/izakaya_pipeline/normalization/type_detection.py` | Numeric type detection (int/float from strings) |
| `pipeline/src/izakaya_pipeline/normalization/normalizer.py` | BQ normalization SQL generator |
| `pipeline/src/izakaya_pipeline/assets/profiling.py` | `profile_source` asset |
| `pipeline/dbt/dbt_project.yml` | dbt project config |
| `pipeline/dbt/models/staging/stg_meta_ads.sql` | First dbt staging model |

---

## Verification

1. **Unit tests**: Date detection algorithm with ISO, DD/MM, MM/DD, ambiguous, Excel serial, mixed format, timestamp cases
2. **Per-file test**: Two CSV files with different date formats in same BQ table → verify each file profiled independently → verify CASE WHEN normalization produces correct dates
3. **Integration test**: Upload CSV with `DD/MM/YYYY` dates via GCS connector → verify profiling detects format → verify normalized table has proper DATE columns → verify pipeline run succeeds
4. **Drift test**: Upload CSV with `DD/MM/YYYY`, then upload with `MM/DD/YYYY` → verify drift alert created
5. **Override test**: Ambiguous dates → user overrides to MM/DD from UI → verify normalization uses override format
6. **Fallback test**: Connector with no profile → `mapped_dataset` reads raw table → `datamart` validation handles dates as before
