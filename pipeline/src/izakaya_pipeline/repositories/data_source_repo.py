"""data_sources, connectors, and mappings queries consolidated."""
from sqlalchemy import text
from sqlalchemy.orm import Session


def get_data_source_type(db: Session, data_source_id: int) -> str | None:
    """Returns dataset_type or None if not found."""
    row = db.execute(
        text("SELECT dataset_type FROM data_sources WHERE id = :id"), {"id": data_source_id}
    ).fetchone()
    return row[0] if row else None


def get_mapped_source(db: Session, data_source_id: int) -> tuple | None:
    """Returns (source_id, bq_table, connector_id, schema_name) or None."""
    row = db.execute(
        text("""
            SELECT ds.id, ds.bq_table, ds.connector_id, c.schema_name
            FROM data_sources ds
            JOIN connectors c ON c.id = ds.connector_id
            WHERE ds.id = :data_source_id AND ds.status = 'mapped'
        """),
        {"data_source_id": data_source_id},
    ).fetchone()
    return tuple(row) if row else None


def get_mappings(db: Session, data_source_id: int) -> list[tuple]:
    """Returns list of (source_column, target_column, static_value)."""
    rows = db.execute(
        text("""
            SELECT source_column, target_column, static_value FROM mappings
            WHERE data_source_id = :ds_id
        """),
        {"ds_id": data_source_id},
    ).fetchall()
    return [tuple(r) for r in rows]


def get_data_sources_needing_run(db: Session) -> list[int]:
    """Returns data source IDs with config changes since last run."""
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
    return [r[0] for r in rows]


def get_fivetran_synced_sources(db: Session) -> list[int]:
    """Returns data source IDs with completed Fivetran syncs and no pending run."""
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
    return [r[0] for r in rows]
