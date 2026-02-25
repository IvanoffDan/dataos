# Data Source Creation Flow — End-to-End Walkthrough

What happens under the hood when a user creates a new connector and then a data source.

---

## Phase 1: Connector Creation

### 1. User clicks "New Connector" in the frontend

The frontend opens `/connectors/new`, where the user picks a connector type (e.g. `facebook_ads`) and gives it a name.

### 2. Frontend -> `POST /api/connectors`

The backend `ConnectorService.create()` calls `fivetran/client.py:create_connection()` which:

- Generates a unique BQ schema name: `{slugified_name}_{8-char-uuid}` (e.g. `facebook_ads_a1b2c3d4`)
- Sends `POST https://api.fivetran.com/v1/connections` with:
  - `group_id`, `service`, `run_setup_tests: false`, `paused: false`
  - `config.schema` and `config.table` (for BQ destination)
  - `connect_card_config.redirect_uri` -> points back to `/connectors`
- Returns the `fivetran_connector_id` + `connect_card_url` + `schema_name`

The backend saves a `Connector` row in Postgres with `sync_state = null` / `setup_state = 'incomplete'`.

### 3. Frontend opens the Connect Card popup

The returned `connect_card_url` is opened in a **popup window** (not iframe — Fivetran blocks that). The user authorizes the data source (e.g. logs into Facebook, selects ad account).

### 4. User completes setup -> popup redirects back

When the popup redirects to `/connectors`, the frontend detects it and calls `POST /api/connectors/{id}/complete-setup`, which:

- Calls `fivetran/client.py:get_connection()` to fetch the latest status from Fivetran
- Updates the `Connector` row with `setup_state`, `sync_state`, `schema_name`
- Calls `fivetran/client.py:trigger_sync()` -> `POST /v1/connections/{id}/sync` with `{"force": true}`
  - This raises `ExternalServiceError` if the HTTP response is non-200 (previously it silently ignored failures)

### 5. Fivetran syncs data into BigQuery

This happens asynchronously on Fivetran's side. Data lands in BQ under the schema `{schema_name}` (e.g. `facebook_ads_a1b2c3d4`). For API connectors like Facebook Ads, this creates multiple tables (`ads_insights_platform_and_device`, `ads_insights_region`, etc.).

The backend periodically (or on user visit) refreshes the connector status. When Fivetran reports `sync_state = 'synced'`, the `Connector.sync_state` is updated in Postgres.

---

## Phase 2: Data Source Creation

### 6. User creates a Data Source

On `/datasets/new`, the user:
- Picks a **dataset type** (e.g. `paid_media`) — this defines the target schema (columns like `date`, `spend`, `geography`, etc.)
- Picks the **connector** created above
- Gives it a name/description

Frontend -> `POST /api/data-sources`

### 7. Backend `DataSourceService.create()`

`backend/src/izakaya_api/domains/data_sources/service.py:66-99`

- Validates the dataset type exists in the registry
- Validates the connector exists
- Calls `get_staging_table(connector.service)` to determine the BQ staging table name
  - For API connectors (facebook_ads, google_ads): returns the dbt model output name (e.g. `stg_facebook_ads`)
  - For DB/FS/passthrough: returns a different table name; may also require `bq_table` selection from the user
- Creates a `DataSource` row with **`status = 'auto_mapping'`**
- Does **NOT** create a PipelineRun — the automation pipeline handles everything from here
- Returns the response to the frontend

### 8. Frontend navigates to `/datasets/{id}`

The detail page uses `useDataSourcePolling(id)` which:
- Fetches the data source
- Sees `status = 'auto_mapping'` -> enables `refetchInterval: 5000` (polls every 5s)
- Renders a blue processing banner: *"AI is mapping source columns to the target schema..."*

---

## Phase 3: Dagster Automation — dbt Transform

### 9. `fivetran_sync_sensor` detects the synced connector (every 60s)

`pipeline/src/izakaya_pipeline/sensors/fivetran_sync_sensor.py`

- Runs the query `get_synced_connectors()` which finds connectors where `sync_state = 'synced'` AND there's a data source with status `'mapped'` or `'auto_mapping'`
- Yields a `RunRequest` for `transform_job` partitioned by `connector_id`

### 10. `dbt_staging` asset runs

`pipeline/src/izakaya_pipeline/assets/dbt_staging.py`

- Looks up the connector's `service` and `schema_name`
- Determines the dbt model via `get_transform_config(service)` — e.g. `stg_facebook_ads`
- Runs `dbt run --select stg_facebook_ads --vars '{"target_schema": "facebook_ads_a1b2c3d4", "bq_project": "..."}'`
- The dbt model JOINs the raw Fivetran tables into a single normalized staging table, written into the Fivetran schema (e.g. `facebook_ads_a1b2c3d4.stg_facebook_ads`)
- Calls `get_mapped_source_ids_for_connector()` to create pending ETL runs — but this only returns `mapped` sources, so **no ETL run is created** for our `auto_mapping` source (correct — auto_map handles it)

---

## Phase 4: Dagster Automation — Auto-Map

### 11. `automation_sensor` detects `auto_mapping` data source (every 30s)

`pipeline/src/izakaya_pipeline/sensors/automation_sensor.py`

- Runs `automation_repo.get_ds_needing_auto_map(db)`:
  ```sql
  SELECT ds.id FROM data_sources ds
  JOIN connectors c ON c.id = ds.connector_id
  WHERE ds.status = 'auto_mapping'
    AND c.sync_state = 'synced'
    AND NOT EXISTS (pending/running pipeline_runs)
  ```
- Finds our data source (connector is synced, no pending runs)
- Adds the data source ID as a dynamic partition
- Yields a `RunRequest` for `auto_map_job` partitioned by `data_source_id`

### 12. `auto_map_asset` runs

`pipeline/src/izakaya_pipeline/assets/auto_map.py`

**Step 12a — Load context:**
- Fetches DS + connector details from DB via `automation_repo.get_ds_with_connector()`
- Loads the `DatasetTypeDef` (e.g. `paid_media`) which defines all target columns

**Step 12b — Read BQ staging table:**
- Calls `infra/bigquery.py:get_table_columns()` -> gets column names/types from `facebook_ads_a1b2c3d4.stg_facebook_ads`
  - e.g. `[{name: "date_start", type: "DATE"}, {name: "spend", type: "FLOAT64"}, ...]`
- Calls `get_sample_values()` -> single UNION ALL query fetching 5 distinct sample values per column

**Step 12c — Build the AI prompt:**
- TARGET COLUMNS section: each column from the dataset type with name, type, description, required flag, format constraints
- SOURCE COLUMNS section: each BQ column with type and sample values
- Uses `AUTOMAP_SYSTEM` prompt (the column mapping specialist system prompt)

**Step 12d — Call Anthropic:**
- `infra/ai.py:chat_json()` -> sends the prompt to Claude
- Response is a JSON array like:
  ```json
  [
    {"target_column": "date", "source_column": "date_start", "confidence": 0.95, "reasoning": "..."},
    {"target_column": "spend", "source_column": "spend", "confidence": 0.98, "reasoning": "..."},
    {"target_column": "geography", "static_value": "AU", "confidence": 0.72, "reasoning": "..."}
  ]
  ```

**Step 12e — Save mappings:**
- `automation_repo.save_mappings()` -> DELETEs existing mappings, INSERTs new ones into `mappings` table

**Step 12f — Trigger ETL:**
- `automation_repo.create_pending_run()` -> INSERTs `PipelineRun(status='pending')` into `pipeline_runs`

**Step 12g — Transition status:**
- `automation_repo.update_ds_status(db, ds_id, 'auto_labelling')`

**On failure:** Sets status to `processing_failed` and re-raises (Dagster retries up to 2 times with 30s delay).

---

## Phase 5: Existing ETL Pipeline (reused)

### 13. `pending_run_sensor` picks up the pending run (every 30s)

`pipeline/src/izakaya_pipeline/sensors/pending_run_sensor.py`

- Finds our `PipelineRun(status='pending')` created by auto_map
- Yields a `RunRequest` for `etl_asset_job` partitioned by `data_source_id`, tagged with `pipeline_run_id`

### 14. `etl_asset_job` runs the 3-asset chain

`mapped_dataset` -> `labelled_dataset` -> `datamart`

**14a. `mapped_dataset` asset:**
- Reads the DS via `get_mapped_source()` which accepts status `'mapped'` or `'auto_labelling'`
- Loads the mappings saved by auto_map
- Reads source data from the BQ staging table (`stg_facebook_ads`)
- Applies column mappings (rename columns, add static values, add `__data_source_id`)
- Writes to `{bq_dataset}.{dataset_type}_mapped` (e.g. `izakaya_warehouse.paid_media_mapped`)

**14b. `labelled_dataset` asset:**
- Reads from `paid_media_mapped`
- Loads label rules for the dataset type from `label_rules` table (none exist yet for a brand new source, or just the ones from prior sources of the same type)
- Applies string replacements: for each string column, if a rule matches `LOWER(value)`, replace with `replace_value`
- Writes to `{bq_dataset}.{dataset_type}_labelled` (e.g. `izakaya_warehouse.paid_media_labelled`)

**14c. `datamart` asset:**
- Reads from `paid_media_labelled`
- Validates all rows against the dataset type schema (type checks, required fields, format validation)
- Valid rows -> written to output table `{bq_dataset}.{dataset_type}` (e.g. `izakaya_warehouse.paid_media`)
- Also writes to history table `{dataset_type}_history` with `_version`, `_pipeline_run_id`, `_snapshot_at`
- Invalid rows -> recorded as `ValidationError` entries in Postgres
- Updates the `PipelineRun` with `status='success'`, `rows_processed`, `rows_failed`, `version`

---

## Phase 6: Dagster Automation — Auto-Label

### 15. `automation_sensor` detects `auto_labelling` with successful ETL (every 30s)

- Runs `automation_repo.get_ds_needing_auto_label(db)`:
  ```sql
  SELECT ds.id FROM data_sources ds
  WHERE ds.status = 'auto_labelling'
    AND the latest PipelineRun is 'success'
  ```
- Finds our data source (ETL just completed successfully)
- Yields a `RunRequest` for `auto_label_job`

### 16. `auto_label_asset` runs

`pipeline/src/izakaya_pipeline/assets/auto_label.py`

**Step 16a — Load context:**
- Fetches DS details, loads `DatasetTypeDef`
- Identifies string columns (e.g. `geography`, `campaign_name`, `device_type`)

**Step 16b — For each string column:**

1. **Get existing rules** from `label_rules` table for context (e.g. prior user-approved canonical values)
2. **Query BQ datamart** via `get_column_value_frequencies()`:
   ```sql
   SELECT LOWER(CAST(geography AS STRING)) as value, COUNT(*) as count
   FROM izakaya_warehouse.paid_media
   GROUP BY value ORDER BY count DESC LIMIT 1000
   ```
   Returns e.g. `[{value: "sydney", count: 1200}, {value: "nsw", count: 800}, ...]`
3. **Filter to unmapped values** (skip any already covered by existing rules)
4. **Build the AI prompt** with column name, description, existing canonical values, and unmapped values + counts
5. **Call Anthropic** -> returns:
   ```json
   [
     {"value": "sydney", "replacement": "Sydney", "confidence": 0.95},
     {"value": "nsw", "replacement": "NSW", "confidence": 0.92},
     {"value": "melb", "replacement": "Melbourne", "confidence": 0.88}
   ]
   ```
6. **Save as label rules** in `label_rules` table with `ai_suggested = true` and the confidence score

**Step 16c — Transition status:**
- `automation_repo.update_ds_status(db, ds_id, 'pending_review')`

**On failure:** Sets status to `processing_failed`, Dagster retries up to 2x.

---

## Phase 7: User Review

### 17. Frontend detects `pending_review`

The detail page (`/datasets/{id}`) was polling every 5s via `useDataSourcePolling`:
- Status changes from `auto_labelling` -> `pending_review`
- Polling stops (no longer a processing status)
- Yellow banner appears: *"Automated mapping and labelling is complete. Please review the results."* with a **"Review & Approve"** button

### 18. User opens the Review Page

`/datasets/{id}/review`

Fetches:
- Data source details (shows `pending_review` badge)
- Mappings (from `GET /data-sources/{id}/mappings`)
- Target column definitions (from dataset type registry)
- Column stats (from `GET /labels/types/{type}/columns` — shows AI rule counts)

Displays:

**Column Mappings** table:

| Target Column | Type | Required | Mapped To |
|---|---|---|---|
| date | DATE | required | date_start |
| spend | FLOAT | required | spend |
| geography | STRING | | "AU" (static) |

**Label Rules (AI Suggested)** section:
- `geography` — 12 AI rules, 15 distinct values
- `campaign_name` — 8 AI rules, 20 distinct values

With links to edit mappings (`/datasets/{id}/mapping`) or labels (`/labels/{dataset_type}`) if the user wants to adjust.

### 19. User clicks "Approve"

Frontend -> `POST /api/data-sources/{id}/approve`

### 20. Backend `DataSourceService.approve()`

- Validates `status == 'pending_review'`
- Sets `status = 'mapped'`
- Creates `PipelineRun(status='pending')` for a final ETL run (to re-process with any edits the user may have made, and to establish the `mapped` state for ongoing syncs)
- Returns the updated data source

Frontend navigates back to `/datasets/{id}` which now shows the full dashboard (KPIs, charts, pipeline runs).

### 21. Final ETL run executes

The `pending_run_sensor` picks up the new pending run -> full `mapped_dataset -> labelled_dataset -> datamart` pipeline runs again with the approved mappings and labels. This produces the definitive output in the datamart table.

---

## Ongoing: Future Fivetran Syncs

After all this is set up, the cycle for **subsequent syncs** is shorter:

1. Fivetran syncs new data -> `fivetran_sync_sensor` -> `transform_job` (dbt)
2. `dbt_staging` creates staging table -> creates `PipelineRun(pending)` for mapped sources
3. `pending_run_sensor` -> `etl_asset_job` -> mapped -> labelled -> datamart
4. Output table updated with fresh data

The automation (auto-map, auto-label) only runs on initial data source creation. Ongoing syncs use the approved mappings and labels directly.

---

## Status Flow Summary

```
auto_mapping -> auto_labelling -> pending_review -> (user approves) -> mapped

On error at any step -> processing_failed
```

## Key Files

| Component | File |
|---|---|
| Connector creation | `backend/src/izakaya_api/infra/fivetran/client.py` |
| Data source creation | `backend/src/izakaya_api/domains/data_sources/service.py` |
| Approve endpoint | `backend/src/izakaya_api/domains/data_sources/router.py` |
| Automation sensor | `pipeline/src/izakaya_pipeline/sensors/automation_sensor.py` |
| Auto-map asset | `pipeline/src/izakaya_pipeline/assets/auto_map.py` |
| Auto-label asset | `pipeline/src/izakaya_pipeline/assets/auto_label.py` |
| Automation SQL queries | `pipeline/src/izakaya_pipeline/repositories/automation_repo.py` |
| AI client (pipeline) | `pipeline/src/izakaya_pipeline/infra/ai.py` |
| BQ helpers (pipeline) | `pipeline/src/izakaya_pipeline/infra/bigquery.py` |
| dbt staging | `pipeline/src/izakaya_pipeline/assets/dbt_staging.py` |
| ETL assets | `pipeline/src/izakaya_pipeline/assets/mapped_dataset.py` etc. |
| Review page | `frontend/src/app/(app)/datasets/[id]/review/page.tsx` |
| Detail page (banners) | `frontend/src/app/(app)/datasets/[id]/page.tsx` |
