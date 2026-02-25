import logging
import os

from dagster import RunFailureSensorContext, run_failure_sensor
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from izakaya_pipeline.repositories import automation_repo, pipeline_run_repo

logger = logging.getLogger(__name__)

_sensor_engine = None


def _get_db_session():
    global _sensor_engine
    url = os.getenv("DATABASE_URL", "postgresql://izakaya:izakaya@localhost:55432/izakaya")
    if _sensor_engine is None:
        _sensor_engine = create_engine(url, pool_size=2, max_overflow=3, pool_pre_ping=True)
    return sessionmaker(bind=_sensor_engine)()


def _get_data_source_id(db, run_id: int) -> int | None:
    row = db.execute(
        text("SELECT data_source_id FROM pipeline_runs WHERE id = :id"),
        {"id": run_id},
    ).fetchone()
    return row[0] if row else None


def _get_ds_status(db, ds_id: int) -> str | None:
    row = db.execute(
        text("SELECT status FROM data_sources WHERE id = :id"),
        {"id": ds_id},
    ).fetchone()
    return row[0] if row else None


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

        # If the data source is in an automation state, move it to processing_failed
        # so it doesn't get stuck forever (no sensor picks up auto_mapping/auto_labelling
        # with a failed latest run).
        ds_id = _get_data_source_id(db, run_id)
        if ds_id:
            ds_status = _get_ds_status(db, ds_id)
            if ds_status in ("auto_mapping", "auto_labelling"):
                automation_repo.update_ds_status(db, ds_id, "processing_failed")
                logger.info(f"DS {ds_id} moved to processing_failed (was {ds_status})")
    finally:
        db.close()
