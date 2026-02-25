import logging
import os

from dagster import RunRequest, sensor
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

logger = logging.getLogger(__name__)


_sensor_engine = None


def _get_db_session():
    global _sensor_engine
    url = os.getenv("DATABASE_URL", "postgresql://izakaya:izakaya@localhost:55432/izakaya")
    if _sensor_engine is None:
        _sensor_engine = create_engine(url, pool_size=2, max_overflow=3)
    return sessionmaker(bind=_sensor_engine)()


@sensor(job_name="etl_asset_job", minimum_interval_seconds=30)
def pending_run_sensor(context):
    """Polls for PipelineRun records with status 'pending' and launches ETL jobs."""
    db = _get_db_session()
    try:
        pending_runs = db.execute(
            text("""
                SELECT pr.id, pr.data_source_id
                FROM pipeline_runs pr
                WHERE pr.status = 'pending'
                ORDER BY pr.created_at ASC
            """)
        ).fetchall()

        for run in pending_runs:
            run_id, data_source_id = run
            logger.info(f"Launching ETL for data source {data_source_id}, run {run_id}")

            # Register the partition key dynamically
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


@sensor(job_name="etl_asset_job", minimum_interval_seconds=30)
def config_change_sensor(context):
    """Detects label rule or mapping changes and creates pending pipeline runs."""
    db = _get_db_session()
    try:
        # Label rules changed: find data sources whose dataset_type has new rules
        # since the last completed run for that data source
        rows = db.execute(
            text("""
                SELECT DISTINCT ds.id
                FROM data_sources ds
                WHERE ds.status = 'mapped'
                AND (
                    EXISTS (
                        SELECT 1 FROM label_rules lr
                        WHERE lr.dataset_type = ds.dataset_type
                        AND lr.created_at > COALESCE(
                            (SELECT MAX(pr.completed_at) FROM pipeline_runs pr
                             WHERE pr.data_source_id = ds.id AND pr.status IN ('success', 'failed')),
                            '1970-01-01'
                        )
                    )
                    OR EXISTS (
                        SELECT 1 FROM mappings m
                        WHERE m.data_source_id = ds.id
                        AND m.created_at > COALESCE(
                            (SELECT MAX(pr.completed_at) FROM pipeline_runs pr
                             WHERE pr.data_source_id = ds.id AND pr.status IN ('success', 'failed')),
                            '1970-01-01'
                        )
                    )
                )
                AND NOT EXISTS (
                    SELECT 1 FROM pipeline_runs pr
                    WHERE pr.data_source_id = ds.id AND pr.status IN ('pending', 'running')
                )
            """)
        ).fetchall()

        for row in rows:
            data_source_id = row[0]
            db.execute(
                text("""
                    INSERT INTO pipeline_runs (data_source_id, status)
                    VALUES (:data_source_id, 'pending')
                """),
                {"data_source_id": data_source_id},
            )
            db.commit()
            logger.info(f"Created pending run for data source {data_source_id} (config change detected)")
    finally:
        db.close()


@sensor(job_name="etl_asset_job", minimum_interval_seconds=60)
def fivetran_sync_sensor(context):
    """Detects completed Fivetran syncs and creates pending pipeline runs."""
    db = _get_db_session()
    try:
        rows = db.execute(
            text("""
                SELECT ds.id
                FROM data_sources ds
                JOIN connectors c ON c.id = ds.connector_id
                WHERE c.sync_state = 'synced'
                  AND ds.status = 'mapped'
                  AND NOT EXISTS (
                    SELECT 1 FROM pipeline_runs pr
                    WHERE pr.data_source_id = ds.id
                      AND pr.status = 'pending'
                  )
            """)
        ).fetchall()

        for row in rows:
            data_source_id = row[0]
            db.execute(
                text("""
                    INSERT INTO pipeline_runs (data_source_id, status)
                    VALUES (:data_source_id, 'pending')
                """),
                {"data_source_id": data_source_id},
            )
            db.commit()
            logger.info(f"Created pending run for data source {data_source_id} (Fivetran sync detected)")
    finally:
        db.close()
