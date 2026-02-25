# Pipeline — Dagster

## Structure

```
src/izakaya_pipeline/
  definitions.py             # Slim: Definitions wiring (assets, jobs, sensors, resources)
  config.py                  # Centralized env var access (PipelineSettings)
  credentials.py             # GCP credential resolution (Dagster Cloud)
  resources.py               # DatabaseResource (pool_pre_ping, context manager), BigQueryResource

  assets/                    # Dagster assets (ETL pipeline)
    partitions.py            # DynamicPartitionsDefinition (data_source_id)
    mapped_dataset.py        # Read BQ → apply mappings → write staging
    labelled_dataset.py      # Read staging → apply labels → write labelled
    datamart.py              # Read labelled → validate → write output + history

  sensors/                   # Dagster sensors
    pending_run_sensor.py    # Polls for pending pipeline_runs
    config_change_sensor.py  # Detects label/mapping changes
    fivetran_sync_sensor.py  # Detects completed Fivetran syncs
    run_lifecycle.py         # run_failure_sensor (marks run failed on asset failure)

  transforms/                # Pure functions (no IO, fully testable)
    mapping.py               # apply_column_mappings(df, mappings) -> df
    labelling.py             # apply_label_rules(df, rules) -> (df, stats)
    validation.py            # validate_dataframe(df, column_defs) -> (valid_rows, errors)

  repositories/              # SQL query consolidation (thin wrappers around text())
    pipeline_run_repo.py     # pipeline_runs CRUD
    data_source_repo.py      # data_sources + connectors + mappings queries
    label_rule_repo.py       # label_rules queries
    validation_error_repo.py # validation_errors bulk insert

  dataset_types/             # Pure domain definitions (dataset schemas)
```

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

## Running

```bash
# From repo root:
make pipeline-dev    # dagster dev on :3001
```
