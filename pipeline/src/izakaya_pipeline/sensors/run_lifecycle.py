import logging
import os

from dagster import RunFailureSensorContext, run_failure_sensor
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


@run_failure_sensor
def run_failure_handler(context: RunFailureSensorContext):
    """Marks pipeline runs as failed when a Dagster run fails."""
    run = context.dagster_run
    run_id_tag = run.tags.get("pipeline_run_id")
    if not run_id_tag:
        return

    try:
        run_id = int(run_id_tag)
    except (ValueError, TypeError):
        return

    db = _get_db_session()
    try:
        error_msg = str(context.failure_event.message)[:500] if context.failure_event else "Unknown error"
        pipeline_run_repo.mark_failed(db, run_id, f"Dagster run failed: {error_msg}")
        logger.info(f"Marked pipeline run {run_id} as failed via run_failure_sensor")
    finally:
        db.close()
