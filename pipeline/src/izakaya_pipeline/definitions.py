import os

from dagster import Definitions, define_asset_job

from izakaya_pipeline.assets import (
    datamart,
    dataset_partitions,
    labelled_dataset,
    mapped_dataset,
)
from izakaya_pipeline.resources import BigQueryResource, DatabaseResource
from izakaya_pipeline.sensors import fivetran_sync_sensor, pending_run_sensor

etl_asset_job = define_asset_job(
    name="etl_asset_job",
    selection=[mapped_dataset, labelled_dataset, datamart],
    partitions_def=dataset_partitions,
)

defs = Definitions(
    assets=[mapped_dataset, labelled_dataset, datamart],
    jobs=[etl_asset_job],
    sensors=[pending_run_sensor, fivetran_sync_sensor],
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
