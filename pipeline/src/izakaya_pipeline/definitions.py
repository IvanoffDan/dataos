from dagster import Definitions

from izakaya_pipeline.assets.etl import etl_job
from izakaya_pipeline.sensors import fivetran_sync_sensor, pending_run_sensor

defs = Definitions(
    jobs=[etl_job],
    sensors=[pending_run_sensor, fivetran_sync_sensor],
)
