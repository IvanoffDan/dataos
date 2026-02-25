import logging
import os

from dagster import RunRequest, sensor
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from izakaya_pipeline.repositories import data_source_repo

logger = logging.getLogger(__name__)

_sensor_engine = None


def _get_db_session():
    global _sensor_engine
    url = os.getenv("DATABASE_URL", "postgresql://izakaya:izakaya@localhost:55432/izakaya")
    if _sensor_engine is None:
        _sensor_engine = create_engine(url, pool_size=2, max_overflow=3, pool_pre_ping=True)
    return sessionmaker(bind=_sensor_engine)()


@sensor(job_name="transform_job", minimum_interval_seconds=30)
def pending_transform_sensor(context):
    """Picks up PipelineRun(status='pending_transform') and triggers dbt transform.

    These are created by:
    - Manual retransform (POST /connectors/{id}/retransform)
    - Initial data source creation on a synced connector
    """
    db = _get_db_session()
    try:
        connector_ids = data_source_repo.get_pending_transform_connector_ids(db)
        for connector_id in connector_ids:
            # Upgrade pending_transform → pending so ETL runs after dbt completes
            data_source_repo.upgrade_pending_transforms(db, connector_id)

            context.instance.add_dynamic_partitions(
                partitions_def_name="connector_id",
                partition_keys=[str(connector_id)],
            )
            yield RunRequest(
                run_key=f"retransform-{connector_id}-{context.cursor or 0}",
                partition_key=str(connector_id),
            )
            logger.info(f"Triggered retransform for connector {connector_id}")
    finally:
        db.close()
