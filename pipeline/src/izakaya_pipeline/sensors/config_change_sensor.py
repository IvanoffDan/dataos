import logging
import os

from dagster import sensor
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from izakaya_pipeline.repositories import data_source_repo, pipeline_run_repo

logger = logging.getLogger(__name__)

_sensor_engine = None


def _get_db_session():
    global _sensor_engine
    url = os.getenv("DATABASE_URL", "postgresql://izakaya:izakaya@localhost:55432/izakaya")
    if _sensor_engine is None:
        _sensor_engine = create_engine(url, pool_size=2, max_overflow=3, pool_pre_ping=True)
    return sessionmaker(bind=_sensor_engine)()


@sensor(job_name="etl_asset_job", minimum_interval_seconds=30)
def config_change_sensor(context):
    """Detects label rule or mapping changes and creates pending pipeline runs."""
    db = _get_db_session()
    try:
        ds_ids = data_source_repo.get_data_sources_needing_run(db)
        for data_source_id in ds_ids:
            pipeline_run_repo.create_pending_run(db, data_source_id)
            logger.info(f"Created pending run for data source {data_source_id} (config change detected)")
    finally:
        db.close()
