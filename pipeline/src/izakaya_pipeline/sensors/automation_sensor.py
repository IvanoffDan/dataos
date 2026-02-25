"""Sensor that detects data sources needing auto-mapping or auto-labelling
and triggers the appropriate Dagster jobs."""
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


@sensor(minimum_interval_seconds=30)
def automation_sensor(context):
    """Polls for data sources in auto_mapping/auto_labelling states and launches jobs."""
    db = _get_db_session()
    try:
        # Phase 1: auto_mapping -> trigger auto_map_job
        ds_ids = automation_repo.get_ds_needing_auto_map(db)
        for ds_id in ds_ids:
            logger.info(f"Triggering auto-map for data source {ds_id}")
            context.instance.add_dynamic_partitions(
                partitions_def_name="data_source_id",
                partition_keys=[str(ds_id)],
            )
            yield RunRequest(
                run_key=f"auto-map-{ds_id}-{int(time.time())}",
                job_name="auto_map_job",
                partition_key=str(ds_id),
            )

        # Phase 2: auto_labelling -> trigger auto_label_job
        ds_ids = automation_repo.get_ds_needing_auto_label(db)
        for ds_id in ds_ids:
            logger.info(f"Triggering auto-label for data source {ds_id}")
            context.instance.add_dynamic_partitions(
                partitions_def_name="data_source_id",
                partition_keys=[str(ds_id)],
            )
            yield RunRequest(
                run_key=f"auto-label-{ds_id}-{int(time.time())}",
                job_name="auto_label_job",
                partition_key=str(ds_id),
            )
    finally:
        db.close()
