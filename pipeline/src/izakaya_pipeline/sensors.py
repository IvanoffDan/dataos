import logging
import os

from dagster import RunConfig, RunRequest, sensor
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

logger = logging.getLogger(__name__)


def _get_db_session():
    url = os.getenv("DATABASE_URL", "postgresql://izakaya:izakaya@localhost:55432/izakaya")
    engine = create_engine(url)
    return sessionmaker(bind=engine)()


@sensor(job_name="etl_job", minimum_interval_seconds=30)
def pending_run_sensor(context):
    """Polls for PipelineRun records with status 'pending' and launches ETL jobs."""
    db = _get_db_session()
    try:
        pending_runs = db.execute(
            text("""
                SELECT pr.id, pr.dataset_id
                FROM pipeline_runs pr
                WHERE pr.status = 'pending'
                ORDER BY pr.created_at ASC
            """)
        ).fetchall()

        for run in pending_runs:
            run_id, dataset_id = run
            logger.info(f"Launching ETL for dataset {dataset_id}, run {run_id}")
            yield RunRequest(
                run_key=f"etl-run-{run_id}",
                run_config=RunConfig(
                    ops={
                        "run_etl": {
                            "config": {
                                "dataset_id": dataset_id,
                                "run_id": run_id,
                            }
                        }
                    }
                ),
            )
    finally:
        db.close()


@sensor(job_name="etl_job", minimum_interval_seconds=60)
def fivetran_sync_sensor(context):
    """Detects completed Fivetran syncs and creates pending pipeline runs."""
    db = _get_db_session()
    try:
        # Find connectors that recently completed sync (sync_state changed to 'synced')
        # and have linked data sources in datasets
        rows = db.execute(
            text("""
                SELECT DISTINCT ds.dataset_id
                FROM data_sources ds
                JOIN connectors c ON c.id = ds.connector_id
                WHERE c.sync_state = 'synced'
                  AND ds.status = 'mapped'
                  AND NOT EXISTS (
                    SELECT 1 FROM pipeline_runs pr
                    WHERE pr.dataset_id = ds.dataset_id
                      AND pr.status = 'pending'
                  )
            """)
        ).fetchall()

        for row in rows:
            dataset_id = row[0]
            # Create a pending run
            db.execute(
                text("""
                    INSERT INTO pipeline_runs (dataset_id, status)
                    VALUES (:dataset_id, 'pending')
                """),
                {"dataset_id": dataset_id},
            )
            db.commit()
            logger.info(f"Created pending run for dataset {dataset_id} (Fivetran sync detected)")
    finally:
        db.close()
