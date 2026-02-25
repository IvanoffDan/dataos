"""validation_errors bulk insert."""
from sqlalchemy import text
from sqlalchemy.orm import Session


def bulk_insert(db: Session, run_id: int, errors: list[dict]) -> None:
    """Insert validation errors for a pipeline run."""
    for err in errors:
        db.execute(
            text("""
                INSERT INTO validation_errors
                    (pipeline_run_id, data_source_id, row_number, column_name,
                     error_type, error_message, source_value)
                VALUES (:run_id, :data_source_id, :row_number, :column_name,
                        :error_type, :error_message, :source_value)
            """),
            {"run_id": run_id, **err},
        )
