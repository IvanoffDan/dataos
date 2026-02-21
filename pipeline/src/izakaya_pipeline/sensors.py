import logging
import os

from dagster import RunRequest, sensor
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

logger = logging.getLogger(__name__)


def _get_db_session():
    url = os.getenv("DATABASE_URL", "postgresql://izakaya:izakaya@localhost:55432/izakaya")
    engine = create_engine(url)
    return sessionmaker(bind=engine)()


@sensor(job_name="etl_asset_job", minimum_interval_seconds=30)
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

            # Register the partition key dynamically
            context.instance.add_dynamic_partitions(
                partitions_def_name="dataset_id",
                partition_keys=[str(dataset_id)],
            )

            yield RunRequest(
                run_key=f"etl-run-{run_id}",
                partition_key=str(dataset_id),
                tags={"pipeline_run_id": str(run_id)},
            )
    finally:
        db.close()


@sensor(job_name="etl_asset_job", minimum_interval_seconds=30)
def config_change_sensor(context):
    """Detects label rule or mapping changes and creates pending pipeline runs."""
    db = _get_db_session()
    try:
        rows = db.execute(
            text("""
                SELECT DISTINCT d.id
                FROM datasets d
                WHERE (
                    EXISTS (
                        SELECT 1 FROM label_rules lr
                        WHERE lr.dataset_id = d.id
                        AND lr.created_at > COALESCE(
                            (SELECT MAX(pr.completed_at) FROM pipeline_runs pr
                             WHERE pr.dataset_id = d.id AND pr.status IN ('success', 'failed')),
                            '1970-01-01'
                        )
                    )
                    OR EXISTS (
                        SELECT 1 FROM mappings m
                        JOIN data_sources ds ON ds.id = m.data_source_id
                        WHERE ds.dataset_id = d.id
                        AND m.created_at > COALESCE(
                            (SELECT MAX(pr.completed_at) FROM pipeline_runs pr
                             WHERE pr.dataset_id = d.id AND pr.status IN ('success', 'failed')),
                            '1970-01-01'
                        )
                    )
                )
                AND NOT EXISTS (
                    SELECT 1 FROM pipeline_runs pr
                    WHERE pr.dataset_id = d.id AND pr.status IN ('pending', 'running')
                )
            """)
        ).fetchall()

        for row in rows:
            dataset_id = row[0]
            db.execute(
                text("""
                    INSERT INTO pipeline_runs (dataset_id, status)
                    VALUES (:dataset_id, 'pending')
                """),
                {"dataset_id": dataset_id},
            )
            db.commit()
            logger.info(f"Created pending run for dataset {dataset_id} (config change detected)")
    finally:
        db.close()


@sensor(job_name="etl_asset_job", minimum_interval_seconds=60)
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
