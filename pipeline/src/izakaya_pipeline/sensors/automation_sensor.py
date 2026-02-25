"""Sensors that detect data sources needing auto-mapping or auto-labelling
and trigger the appropriate Dagster jobs."""
import logging
import os
import time

from dagster import RunRequest, sensor
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from izakaya_pipeline.repositories import automation_repo

logger = logging.getLogger(__name__)

_sensor_engine = None


def _get_db_session():
    global _sensor_engine
    url = os.getenv("DATABASE_URL", "postgresql://izakaya:izakaya@localhost:55432/izakaya")
    if _sensor_engine is None:
        _sensor_engine = create_engine(url, pool_size=2, max_overflow=3, pool_pre_ping=True)
    return sessionmaker(bind=_sensor_engine)()


@sensor(job_name="auto_map_job", minimum_interval_seconds=30)
def auto_map_sensor(context):
    """Polls for data sources in auto_mapping state and launches auto_map_job."""
    db = _get_db_session()
    try:
        ds_ids = automation_repo.get_ds_needing_auto_map(db)
        for ds_id in ds_ids:
            logger.info(f"Triggering auto-map for data source {ds_id}")
            context.instance.add_dynamic_partitions(
                partitions_def_name="data_source_id",
                partition_keys=[str(ds_id)],
            )
            yield RunRequest(
                run_key=f"auto-map-{ds_id}-{int(time.time())}",
                partition_key=str(ds_id),
            )
    finally:
        db.close()


@sensor(job_name="auto_label_job", minimum_interval_seconds=30)
def auto_label_sensor(context):
    """Polls for data sources in auto_labelling state and launches auto_label_job."""
    db = _get_db_session()
    try:
        ds_ids = automation_repo.get_ds_needing_auto_label(db)
        for ds_id in ds_ids:
            logger.info(f"Triggering auto-label for data source {ds_id}")
            context.instance.add_dynamic_partitions(
                partitions_def_name="data_source_id",
                partition_keys=[str(ds_id)],
            )
            yield RunRequest(
                run_key=f"auto-label-{ds_id}-{int(time.time())}",
                partition_key=str(ds_id),
            )
    finally:
        db.close()
