import json
import os
import tempfile

from dagster import Definitions, define_asset_job

# Dagster Cloud: write SA key JSON to a temp file so google-cloud libraries can find it
if os.getenv("GOOGLE_APPLICATION_CREDENTIALS_JSON") and not os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
    _creds = json.loads(os.environ["GOOGLE_APPLICATION_CREDENTIALS_JSON"])
    _tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
    json.dump(_creds, _tmp)
    _tmp.flush()
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = _tmp.name

from izakaya_pipeline.assets import (
    datamart,
    dataset_partitions,
    labelled_dataset,
    mapped_dataset,
)
from izakaya_pipeline.resources import BigQueryResource, DatabaseResource
from izakaya_pipeline.sensors import config_change_sensor, fivetran_sync_sensor, pending_run_sensor

etl_asset_job = define_asset_job(
    name="etl_asset_job",
    selection=[mapped_dataset, labelled_dataset, datamart],
    partitions_def=dataset_partitions,
)

defs = Definitions(
    assets=[mapped_dataset, labelled_dataset, datamart],
    jobs=[etl_asset_job],
    sensors=[pending_run_sensor, fivetran_sync_sensor, config_change_sensor],
    resources={
        "database": DatabaseResource(
            connection_url=os.getenv(
                "DATABASE_URL", "postgresql://izakaya:izakaya@localhost:55432/izakaya"
            ),
        ),
        "bigquery_resource": BigQueryResource(
            project_id=os.getenv("BQ_PROJECT_ID", ""),
            dataset=os.getenv("BQ_DATASET", "izakaya_warehouse"),
        ),
    },
)
