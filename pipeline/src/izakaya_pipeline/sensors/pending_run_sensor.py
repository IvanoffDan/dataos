import logging
import os

from dagster import RunRequest, sensor
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from izakaya_pipeline.repositories import pipeline_run_repo

logger = logging.getLogger(__name__)

_sensor_engine = None


def _get_db_session():
    global _sensor_engine
    url = os.getenv("DATABASE_URL", "postgresql://izakaya:izakaya@localhost:55432/izakaya")
    if _sensor_engine is None:
        _sensor_engine = create_engine(url, pool_size=2, max_overflow=3, pool_pre_ping=True)
    return sessionmaker(bind=_sensor_engine)()


@sensor(job_name="etl_asset_job", minimum_interval_seconds=30)
def pending_run_sensor(context):
    """Polls for PipelineRun records with status 'pending' and launches ETL jobs."""
    db = _get_db_session()
    try:
        pending_runs = pipeline_run_repo.get_pending_runs(db)

        for run_id, data_source_id in pending_runs:
            logger.info(f"Launching ETL for data source {data_source_id}, run {run_id}")

            context.instance.add_dynamic_partitions(
                partitions_def_name="data_source_id",
                partition_keys=[str(data_source_id)],
            )

            yield RunRequest(
                run_key=f"etl-run-{run_id}",
                partition_key=str(data_source_id),
                tags={"pipeline_run_id": str(run_id)},
            )
    finally:
        db.close()
