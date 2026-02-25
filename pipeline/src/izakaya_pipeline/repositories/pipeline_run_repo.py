"""All pipeline_runs queries consolidated."""
from sqlalchemy import text
from sqlalchemy.orm import Session


def get_pending_runs(db: Session) -> list[tuple[int, int]]:
    """Returns list of (run_id, data_source_id) for pending runs."""
    rows = db.execute(
        text("""
            SELECT pr.id, pr.data_source_id
            FROM pipeline_runs pr
            WHERE pr.status = 'pending'
            ORDER BY pr.created_at ASC
        """)
    ).fetchall()
    return [(r[0], r[1]) for r in rows]


def mark_running(db: Session, run_id: int) -> None:
    db.execute(
        text("UPDATE pipeline_runs SET status = 'running', started_at = now() WHERE id = :id"),
        {"id": run_id},
    )
    db.commit()


def mark_failed(db: Session, run_id: int, summary: str) -> None:
    db.execute(
        text("""
            UPDATE pipeline_runs
            SET status = 'failed', completed_at = now(), error_summary = :summary
            WHERE id = :id
        """),
        {"id": run_id, "summary": summary[:500]},
    )
    db.commit()


def mark_completed(
    db: Session,
    run_id: int,
    status: str,
    rows_processed: int,
    rows_failed: int,
    error_summary: str | None,
    version: int | None,
) -> None:
    db.execute(
        text("""
            UPDATE pipeline_runs
            SET status = :status, completed_at = now(),
                rows_processed = :processed, rows_failed = :failed,
                error_summary = :summary, version = :version
            WHERE id = :id
        """),
        {
            "id": run_id,
            "status": status,
            "processed": rows_processed,
            "failed": rows_failed,
            "summary": error_summary,
            "version": version,
        },
    )
    db.commit()


def get_max_version(db: Session, data_source_id: int) -> int:
    result = db.execute(
        text("SELECT COALESCE(MAX(version), 0) FROM pipeline_runs WHERE data_source_id = :dsid"),
        {"dsid": data_source_id},
    ).scalar()
    return result or 0


def create_pending_run(db: Session, data_source_id: int) -> None:
    db.execute(
        text("""
            INSERT INTO pipeline_runs (data_source_id, status)
            VALUES (:data_source_id, 'pending')
        """),
        {"data_source_id": data_source_id},
    )
    db.commit()
