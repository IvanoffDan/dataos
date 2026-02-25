"""SQL queries for the automation sensor and auto-map/auto-label assets."""
from sqlalchemy import text
from sqlalchemy.orm import Session


def get_ds_needing_auto_map(db: Session) -> list[int]:
    """Data sources in auto_mapping status with no pending/running pipeline runs
    and whose connector has completed at least one sync (sync_state='synced')."""
    rows = db.execute(
        text("""
            SELECT ds.id
            FROM data_sources ds
            JOIN connectors c ON c.id = ds.connector_id
            WHERE ds.status = 'auto_mapping'
              AND c.sync_state = 'synced'
              AND NOT EXISTS (
                SELECT 1 FROM pipeline_runs pr
                WHERE pr.data_source_id = ds.id
                  AND pr.status IN ('pending', 'running', 'pending_transform')
              )
        """)
    ).fetchall()
    return [r[0] for r in rows]


def get_ds_needing_auto_label(db: Session) -> list[int]:
    """Data sources in auto_labelling status whose latest PipelineRun is success."""
    rows = db.execute(
        text("""
            SELECT ds.id
            FROM data_sources ds
            WHERE ds.status = 'auto_labelling'
              AND EXISTS (
                SELECT 1 FROM pipeline_runs pr
                WHERE pr.data_source_id = ds.id
                  AND pr.status = 'success'
                  AND pr.id = (
                    SELECT MAX(pr2.id) FROM pipeline_runs pr2
                    WHERE pr2.data_source_id = ds.id
                  )
              )
        """)
    ).fetchall()
    return [r[0] for r in rows]


def update_ds_status(db: Session, ds_id: int, status: str) -> None:
    """Update a data source's status."""
    db.execute(
        text("UPDATE data_sources SET status = :status, updated_at = now() WHERE id = :id"),
        {"status": status, "id": ds_id},
    )
    db.commit()


def get_ds_with_connector(db: Session, ds_id: int) -> dict | None:
    """Fetch data source + connector details needed for AI processing."""
    row = db.execute(
        text("""
            SELECT ds.id, ds.name, ds.dataset_type, ds.bq_table, ds.raw_table,
                   c.id AS connector_id, c.schema_name, c.service
            FROM data_sources ds
            JOIN connectors c ON c.id = ds.connector_id
            WHERE ds.id = :id
        """),
        {"id": ds_id},
    ).fetchone()
    if not row:
        return None
    return {
        "id": row[0],
        "name": row[1],
        "dataset_type": row[2],
        "bq_table": row[3],
        "raw_table": row[4],
        "connector_id": row[5],
        "schema_name": row[6],
        "service": row[7],
    }


def save_mappings(db: Session, ds_id: int, mappings: list[dict]) -> None:
    """Insert mapping rows for a data source (deletes existing first)."""
    db.execute(
        text("DELETE FROM mappings WHERE data_source_id = :ds_id"),
        {"ds_id": ds_id},
    )
    for m in mappings:
        db.execute(
            text("""
                INSERT INTO mappings (data_source_id, source_column, target_column, static_value)
                VALUES (:ds_id, :source_column, :target_column, :static_value)
            """),
            {
                "ds_id": ds_id,
                "source_column": m.get("source_column"),
                "target_column": m["target_column"],
                "static_value": m.get("static_value"),
            },
        )
    db.commit()


def save_label_rules(db: Session, dataset_type: str, column_name: str, rules: list[dict]) -> None:
    """Insert AI-suggested label rules for a column (additive — does not delete existing)."""
    for rule in rules:
        db.execute(
            text("""
                INSERT INTO label_rules (dataset_type, column_name, match_value, replace_value, ai_suggested, confidence)
                VALUES (:dtype, :col, :match, :replace, true, :conf)
            """),
            {
                "dtype": dataset_type,
                "col": column_name,
                "match": rule["value"],
                "replace": rule["replacement"],
                "conf": rule.get("confidence", 0.0),
            },
        )
    db.commit()


def get_existing_label_rules(db: Session, dataset_type: str, column_name: str) -> list[dict]:
    """Get existing label rules for a column."""
    rows = db.execute(
        text("""
            SELECT match_value, replace_value, ai_suggested
            FROM label_rules
            WHERE dataset_type = :dtype AND column_name = :col
        """),
        {"dtype": dataset_type, "col": column_name},
    ).fetchall()
    return [
        {"match_value": r[0], "replace_value": r[1], "ai_suggested": r[2]}
        for r in rows
    ]


def create_pending_run(db: Session, ds_id: int) -> None:
    """Create a pending pipeline run for a data source."""
    db.execute(
        text("INSERT INTO pipeline_runs (data_source_id, status) VALUES (:ds_id, 'pending')"),
        {"ds_id": ds_id},
    )
    db.commit()


def has_pending_run(db: Session, ds_id: int) -> bool:
    """Check if a data source already has a pending pipeline run."""
    row = db.execute(
        text("SELECT 1 FROM pipeline_runs WHERE data_source_id = :ds_id AND status = 'pending' LIMIT 1"),
        {"ds_id": ds_id},
    ).fetchone()
    return row is not None
