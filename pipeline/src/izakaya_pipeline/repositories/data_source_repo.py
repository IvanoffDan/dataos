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


def get_synced_connectors(db: Session) -> list[tuple[int, str]]:
    """Returns (connector_id, service) for synced connectors with mapped data sources
    that have no pending/running pipeline runs."""
    rows = db.execute(
        text("""
            SELECT DISTINCT c.id, c.service
            FROM connectors c
            JOIN data_sources ds ON ds.connector_id = c.id
            WHERE c.sync_state = 'synced'
              AND ds.status = 'mapped'
              AND NOT EXISTS (
                SELECT 1 FROM pipeline_runs pr
                JOIN data_sources ds2 ON ds2.id = pr.data_source_id
                WHERE ds2.connector_id = c.id
                  AND pr.status IN ('pending', 'running')
              )
        """)
    ).fetchall()
    return [(r[0], r[1]) for r in rows]


def get_connector_for_transform(db: Session, connector_id: int) -> tuple | None:
    """Returns (service, schema_name) for a connector, or None."""
    row = db.execute(
        text("SELECT service, schema_name FROM connectors WHERE id = :id"),
        {"id": connector_id},
    ).fetchone()
    return tuple(row) if row else None


def get_raw_table_for_source(db: Session, connector_id: int) -> str | None:
    """Returns the raw_table for the first mapped data source on a connector."""
    row = db.execute(
        text("""
            SELECT raw_table FROM data_sources
            WHERE connector_id = :cid AND status = 'mapped' AND raw_table IS NOT NULL
            LIMIT 1
        """),
        {"cid": connector_id},
    ).fetchone()
    return row[0] if row else None


def get_mapped_source_ids_for_connector(db: Session, connector_id: int) -> list[int]:
    """Returns data source IDs for mapped sources on a connector with no pending run."""
    rows = db.execute(
        text("""
            SELECT ds.id FROM data_sources ds
            WHERE ds.connector_id = :cid AND ds.status = 'mapped'
            AND NOT EXISTS (
                SELECT 1 FROM pipeline_runs pr
                WHERE pr.data_source_id = ds.id AND pr.status = 'pending'
            )
        """),
        {"cid": connector_id},
    ).fetchall()
    return [r[0] for r in rows]


def get_pending_transform_connector_ids(db: Session) -> list[int]:
    """Returns distinct connector IDs that have data sources with pending_transform runs."""
    rows = db.execute(
        text("""
            SELECT DISTINCT c.id
            FROM pipeline_runs pr
            JOIN data_sources ds ON ds.id = pr.data_source_id
            JOIN connectors c ON c.id = ds.connector_id
            WHERE pr.status = 'pending_transform'
        """)
    ).fetchall()
    return [r[0] for r in rows]


def upgrade_pending_transforms(db: Session, connector_id: int) -> None:
    """Change pending_transform → pending for all runs on a connector's data sources."""
    db.execute(
        text("""
            UPDATE pipeline_runs SET status = 'pending'
            WHERE status = 'pending_transform'
              AND data_source_id IN (
                SELECT id FROM data_sources WHERE connector_id = :cid
              )
        """),
        {"cid": connector_id},
    )
    db.commit()
