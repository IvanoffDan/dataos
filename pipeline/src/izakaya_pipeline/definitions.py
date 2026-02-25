import os

from dagster import Definitions, define_asset_job

from izakaya_pipeline.credentials import resolve_gcp_credentials

# Dagster Cloud: write SA key JSON to a temp file so google-cloud libraries can find it
resolve_gcp_credentials()

from izakaya_pipeline.assets import (
    auto_label_asset,
    auto_map_asset,
    connector_partitions,
    datamart,
    dataset_partitions,
    dbt_staging,
    labelled_dataset,
    mapped_dataset,
)
from izakaya_pipeline.resources import BigQueryResource, DatabaseResource
from izakaya_pipeline.sensors import (
    automation_sensor,
    config_change_sensor,
    fivetran_sync_sensor,
    pending_run_sensor,
    pending_transform_sensor,
    run_failure_handler,
)

etl_asset_job = define_asset_job(
    name="etl_asset_job",
    selection=[mapped_dataset, labelled_dataset, datamart],
    partitions_def=dataset_partitions,
)

transform_job = define_asset_job(
    name="transform_job",
    selection=[dbt_staging],
    partitions_def=connector_partitions,
)

auto_map_job = define_asset_job(
    name="auto_map_job",
    selection=[auto_map_asset],
    partitions_def=dataset_partitions,
)

auto_label_job = define_asset_job(
    name="auto_label_job",
    selection=[auto_label_asset],
    partitions_def=dataset_partitions,
)

defs = Definitions(
    assets=[mapped_dataset, labelled_dataset, datamart, dbt_staging, auto_map_asset, auto_label_asset],
    jobs=[etl_asset_job, transform_job, auto_map_job, auto_label_job],
    sensors=[
        automation_sensor,
        pending_run_sensor,
        fivetran_sync_sensor,
        config_change_sensor,
        pending_transform_sensor,
        run_failure_handler,
    ],
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
