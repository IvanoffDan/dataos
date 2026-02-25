# Pipeline — Dagster

## Structure

```
src/izakaya_pipeline/
  definitions.py             # Slim: Definitions wiring (assets, jobs, sensors, resources)
  config.py                  # Centralized env var access (PipelineSettings)
  credentials.py             # GCP credential resolution (Dagster Cloud)
  resources.py               # DatabaseResource (pool_pre_ping, context manager), BigQueryResource

  assets/                    # Dagster assets
    partitions.py            # DynamicPartitionsDefinition (data_source_id)
    dbt_staging.py           # dbt orchestration — runs dbt models per connector, creates PipelineRun(status='pending')
    mapped_dataset.py        # Read BQ → apply mappings → write staging
    labelled_dataset.py      # Read staging → apply labels → write labelled
    datamart.py              # Read labelled → validate → write output + history

  sensors/                   # Dagster sensors
    fivetran_sync_sensor.py  # Detects completed Fivetran syncs → triggers transform_job
    pending_transform_sensor.py  # Picks up PipelineRun(status='pending_transform') → triggers transform_job
    pending_run_sensor.py    # Polls for PipelineRun(status='pending') → triggers etl_asset_job
    config_change_sensor.py  # Detects label/mapping changes
    run_lifecycle.py         # run_failure_handler (marks run failed on asset failure)

  transforms/                # Pure functions (no IO, fully testable)
    registry.py              # Transform config registry — maps Fivetran services to dbt models/categories
    mapping.py               # apply_column_mappings(df, mappings) -> df
    labelling.py             # apply_label_rules(df, rules) -> (df, stats)
    validation.py            # validate_dataframe(df, column_defs) -> (valid_rows, errors)

  repositories/              # SQL query consolidation (thin wrappers around text())
    pipeline_run_repo.py     # pipeline_runs CRUD
    data_source_repo.py      # data_sources + connectors + mappings queries
    label_rule_repo.py       # label_rules queries
    validation_error_repo.py # validation_errors bulk insert

  dataset_types/             # Pure domain definitions (dataset schemas)

dbt/                         # dbt project for staging transforms
  dbt_project.yml            # Project config (all models materialized as table)
  profiles.yml               # BigQuery connection (reads from env vars)
  macros/
    generate_schema_name.sql # Writes output into Fivetran's own BQ schema via var('target_schema')
    normalize_date.sql       # Date parsing helpers
    normalize_types.sql      # Safe type casting helpers
  models/staging/
    api/                     # Multi-table JOIN transforms
      stg_facebook_ads.sql   # ads_insights_platform_and_device + ads_insights_region → regional fanout
      stg_google_ads.sql     # campaign_stats + geo_performance → geo cost share fanout
    file_system/
      stg_file_system.sql    # Orphan removal — keeps only rows from active files (latest sync window)
    db/
      stg_database.sql       # Soft-delete filtering (WHERE _fivetran_deleted = false)
    passthrough/
      stg_passthrough.sql    # SELECT * fallback for unknown connector types
```

## Pipeline Flow

Two-phase orchestration:

1. **Fivetran sync completes** → `fivetran_sync_sensor` → `transform_job` (dbt)
2. **dbt_staging asset** runs the appropriate dbt model, writes staging table into Fivetran's schema, creates `PipelineRun(status='pending')`
3. **pending_run_sensor** → `etl_asset_job` (mapped_dataset → labelled_dataset → datamart)

Manual retransform: backend creates `PipelineRun(status='pending_transform')` → `pending_transform_sensor` → `transform_job`

## Connector Categories

Defined in `transforms/registry.py`. Each Fivetran service maps to a category and dbt model:

- **API** (`facebook_ads`, `google_ads`) — multi-table JOINs, no user table selection
- **FILE_SYSTEM** (`sftp`, `s3`, `gcs`) — orphan row removal, auto-detect table
- **DB** (`postgres`, `mysql`) — soft-delete filtering, user selects source table
- **PASSTHROUGH** (fallback) — SELECT * for unknown services

## Jobs

- `transform_job` — runs `dbt_staging` asset, partitioned by `connector_id`
- `etl_asset_job` — runs `mapped_dataset → labelled_dataset → datamart`, partitioned by `data_source_id`

## Conventions

- Uses `src/` layout like the backend
- dagster-fivetran integration for orchestrating Fivetran syncs
- **Assets** receive resources via Dagster `Depends()` — use `database: DatabaseResource` and `bigquery_resource: BigQueryResource`
- **Sensors** use a module-level `_get_db_session()` helper with `os.getenv("DATABASE_URL")` — sensors cannot access Dagster resources directly
- **Transforms** are pure functions with no IO — pass data in, get data out. High-value test targets.
- **Repositories** consolidate raw SQL from scattered locations into testable modules
- All assets have `RetryPolicy(max_retries=2, delay=30)` for transient BQ/PG failures
- `run_failure_handler` sensor catches Dagster run failures and marks pipeline_runs as failed
- Re-export shims: `sensors.py` → `sensors/`, `assets/etl.py` → `assets/*.py`
- dbt uses `generate_schema_name` macro to write into Fivetran's schema — this means existing ETL code reads from the staging table without changes
- dbt models use `--vars` for dynamic schema/table injection at runtime
- All dbt models are full-refresh (materialized as table, `--full-refresh` flag)

## Testing dbt Models

```bash
cd pipeline/dbt

# Compile only (validates SQL without running)
dbt compile --select stg_facebook_ads \
  --vars '{"bq_project": "your-project", "target_schema": "facebook_ads_abc123"}'

# Run against real BQ data
dbt run --select stg_facebook_ads \
  --vars '{"bq_project": "your-project", "target_schema": "facebook_ads_abc123"}'
```

## Running

```bash
# From repo root:
make pipeline-dev    # dagster dev on :3001
```
