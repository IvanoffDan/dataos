import logging
import os
from datetime import datetime

import httpx
import pandas as pd
from dagster import Field, Int, Out, job, op
from google.cloud import bigquery
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

logger = logging.getLogger(__name__)


def _get_db_session() -> Session:
    url = os.getenv("DATABASE_URL", "postgresql://izakaya:izakaya@localhost:55432/izakaya")
    engine = create_engine(url)
    return sessionmaker(bind=engine)()


def _get_bq_client() -> bigquery.Client:
    project_id = os.getenv("BQ_PROJECT_ID", "")
    return bigquery.Client(project=project_id)


def _get_column_defs(dataset_type: str) -> list[dict]:
    """Fetch column definitions from the backend API."""
    backend_url = os.getenv("BACKEND_URL", "http://localhost:8000")
    resp = httpx.get(f"{backend_url}/datasets/types/{dataset_type}/columns")
    resp.raise_for_status()
    return resp.json()


def _validate_row(
    row: dict,
    row_num: int,
    column_defs: list[dict],
    data_source_id: int,
) -> tuple[dict | None, list[dict]]:
    """Validate a single row. Returns (clean_row_or_None, list_of_errors)."""
    errors = []
    clean = {}

    col_map = {c["name"]: c for c in column_defs}

    for col_def in column_defs:
        name = col_def["name"]
        value = row.get(name)
        data_type = col_def["data_type"]
        required = col_def["required"]

        # Handle None / empty
        is_empty = value is None or (isinstance(value, str) and value.strip() == "")
        if pd.isna(value) if not isinstance(value, str) else False:
            is_empty = True

        if is_empty:
            if required:
                errors.append({
                    "data_source_id": data_source_id,
                    "row_number": row_num,
                    "column_name": name,
                    "error_type": "missing_required",
                    "error_message": f"Required column '{name}' is missing or empty",
                    "source_value": str(value) if value is not None else None,
                })
            clean[name] = None
            continue

        # Type coercion and validation
        str_val = str(value).strip()

        if data_type == "string":
            max_length = col_def.get("max_length")
            if max_length and len(str_val) > max_length:
                errors.append({
                    "data_source_id": data_source_id,
                    "row_number": row_num,
                    "column_name": name,
                    "error_type": "too_long",
                    "error_message": (
                        f"Column '{name}': exceeds max length {max_length} "
                        f"(got {len(str_val)} characters)"
                    ),
                    "source_value": str_val[:100],
                })
            clean[name] = str_val

        elif data_type == "integer":
            try:
                int_val = int(float(str_val))
                min_value = col_def.get("min_value")
                if min_value is not None and int_val < min_value:
                    errors.append({
                        "data_source_id": data_source_id,
                        "row_number": row_num,
                        "column_name": name,
                        "error_type": "out_of_range",
                        "error_message": (
                            f"Column '{name}': expected integer >= {int(min_value)}, got '{int_val}'"
                        ),
                        "source_value": str_val,
                    })
                clean[name] = int_val
            except (ValueError, TypeError):
                errors.append({
                    "data_source_id": data_source_id,
                    "row_number": row_num,
                    "column_name": name,
                    "error_type": "invalid_type",
                    "error_message": f"Column '{name}': expected integer, got '{str_val}'",
                    "source_value": str_val[:100],
                })
                clean[name] = None

        elif data_type == "float":
            try:
                float_val = float(str_val)
                min_value = col_def.get("min_value")
                if min_value is not None and float_val < min_value:
                    errors.append({
                        "data_source_id": data_source_id,
                        "row_number": row_num,
                        "column_name": name,
                        "error_type": "out_of_range",
                        "error_message": (
                            f"Column '{name}': expected numeric >= {min_value}, got '{float_val}'"
                        ),
                        "source_value": str_val,
                    })
                clean[name] = float_val
            except (ValueError, TypeError):
                errors.append({
                    "data_source_id": data_source_id,
                    "row_number": row_num,
                    "column_name": name,
                    "error_type": "invalid_type",
                    "error_message": f"Column '{name}': expected numeric, got '{str_val}'",
                    "source_value": str_val[:100],
                })
                clean[name] = None

        elif data_type == "date":
            fmt = col_def.get("format", "yyyy-MM-dd")
            py_fmt = fmt.replace("yyyy", "%Y").replace("MM", "%m").replace("dd", "%d")
            try:
                parsed = datetime.strptime(str_val, py_fmt)
                clean[name] = parsed.strftime("%Y-%m-%d")
            except ValueError:
                # Try ISO format as fallback
                try:
                    parsed = datetime.fromisoformat(str_val[:10])
                    clean[name] = parsed.strftime("%Y-%m-%d")
                except ValueError:
                    errors.append({
                        "data_source_id": data_source_id,
                        "row_number": row_num,
                        "column_name": name,
                        "error_type": "invalid_format",
                        "error_message": (
                            f"Column '{name}': expected format '{fmt}', got '{str_val}'"
                        ),
                        "source_value": str_val[:100],
                    })
                    clean[name] = None
        else:
            clean[name] = str_val

    return clean, errors


@op(
    config_schema={
        "dataset_id": Field(Int, description="ID of the dataset to process"),
        "run_id": Field(Int, description="ID of the pipeline run record"),
    },
    out={"result": Out()},
)
def run_etl(context) -> dict:
    """ETL op: read from BQ, normalize, validate, write output."""
    dataset_id = context.op_config["dataset_id"]
    run_id = context.op_config["run_id"]

    db = _get_db_session()
    bq = _get_bq_client()
    bq_dataset = os.getenv("BQ_DATASET", "izakaya_warehouse")
    bq_project = os.getenv("BQ_PROJECT_ID", "")

    try:
        # Update run status to running
        db.execute(
            text("UPDATE pipeline_runs SET status = 'running', started_at = now() WHERE id = :id"),
            {"id": run_id},
        )
        db.commit()

        # Load dataset
        row = db.execute(
            text("SELECT type FROM datasets WHERE id = :id"), {"id": dataset_id}
        ).fetchone()
        if not row:
            raise ValueError(f"Dataset {dataset_id} not found")
        dataset_type = row[0]

        # Load column defs from backend API
        column_defs = _get_column_defs(dataset_type)

        # Load mapped data sources
        sources = db.execute(
            text("""
                SELECT ds.id, ds.bq_table, ds.connector_id, c.schema_name
                FROM data_sources ds
                JOIN connectors c ON c.id = ds.connector_id
                WHERE ds.dataset_id = :dataset_id AND ds.status = 'mapped'
            """),
            {"dataset_id": dataset_id},
        ).fetchall()

        all_valid_rows: list[dict] = []
        all_errors: list[dict] = []
        total_processed = 0

        for source in sources:
            source_id, bq_table, _, schema_name = source

            # Load mappings for this source
            mapping_rows = db.execute(
                text("""
                    SELECT source_column, target_column, static_value FROM mappings
                    WHERE data_source_id = :ds_id
                """),
                {"ds_id": source_id},
            ).fetchall()

            if not mapping_rows:
                continue

            # Separate column mappings from static mappings
            col_mapping = {}  # source_column -> target_column
            static_mapping = {}  # target_column -> static_value
            for r in mapping_rows:
                source_col, target_col, static_val = r
                if static_val is not None:
                    static_mapping[target_col] = static_val
                elif source_col:
                    col_mapping[source_col] = target_col

            # Read from BQ (only column-mapped columns)
            if col_mapping:
                source_cols = ", ".join(
                    f"`{sc}`" for sc in col_mapping.keys()
                )
                query = f"SELECT {source_cols} FROM `{bq_project}.{schema_name}.{bq_table}`"

                try:
                    df = bq.query(query).to_dataframe()
                except Exception as e:
                    logger.error(f"Failed to read BQ table {schema_name}.{bq_table}: {e}")
                    all_errors.append({
                        "data_source_id": source_id,
                        "row_number": 0,
                        "column_name": "",
                        "error_type": "bq_read_error",
                        "error_message": f"Failed to read source table: {str(e)[:200]}",
                        "source_value": None,
                    })
                    continue

                # Rename columns per mapping
                df = df.rename(columns=col_mapping)
            else:
                # All mappings are static — still need to know how many rows
                query = f"SELECT COUNT(*) as cnt FROM `{bq_project}.{schema_name}.{bq_table}`"
                try:
                    row_count = bq.query(query).to_dataframe().iloc[0]["cnt"]
                except Exception as e:
                    logger.error(f"Failed to read BQ table {schema_name}.{bq_table}: {e}")
                    all_errors.append({
                        "data_source_id": source_id,
                        "row_number": 0,
                        "column_name": "",
                        "error_type": "bq_read_error",
                        "error_message": f"Failed to read source table: {str(e)[:200]}",
                        "source_value": None,
                    })
                    continue
                df = pd.DataFrame(index=range(row_count))

            # Add static value columns
            for target_col, static_val in static_mapping.items():
                df[target_col] = static_val

            # Validate each row
            for idx, row_data in df.iterrows():
                row_num = int(idx) + 1
                total_processed += 1
                clean_row, row_errors = _validate_row(
                    row_data.to_dict(), row_num, column_defs, source_id
                )
                all_errors.extend(row_errors)
                if clean_row and not any(
                    e["error_type"] == "missing_required" for e in row_errors
                ):
                    all_valid_rows.append(clean_row)

        # Write valid rows to BQ output table
        output_table = f"{bq_project}.{bq_dataset}.{dataset_type}"
        if all_valid_rows:
            out_df = pd.DataFrame(all_valid_rows)
            job_config = bigquery.LoadJobConfig(
                write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
            )
            load_job = bq.load_table_from_dataframe(out_df, output_table, job_config=job_config)
            load_job.result()
            logger.info(f"Wrote {len(all_valid_rows)} rows to {output_table}")

        # Write validation errors to Postgres
        if all_errors:
            for err in all_errors:
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

        # Update run status
        rows_failed = len([e for e in all_errors if e.get("error_type") == "missing_required"])
        status = "success" if not all_errors else "success"
        if not sources:
            status = "failed"
            error_summary = "No mapped data sources found"
        elif not all_valid_rows and all_errors:
            status = "failed"
            error_summary = f"All rows failed validation ({len(all_errors)} errors)"
        else:
            error_summary = f"{len(all_errors)} validation errors" if all_errors else None

        db.execute(
            text("""
                UPDATE pipeline_runs
                SET status = :status, completed_at = now(),
                    rows_processed = :processed, rows_failed = :failed,
                    error_summary = :summary
                WHERE id = :id
            """),
            {
                "id": run_id,
                "status": status,
                "processed": len(all_valid_rows),
                "failed": len(all_errors),
                "summary": error_summary,
            },
        )
        db.commit()

        return {
            "status": status,
            "rows_processed": len(all_valid_rows),
            "errors": len(all_errors),
        }

    except Exception as e:
        logger.exception(f"ETL failed for dataset {dataset_id}")
        db.execute(
            text("""
                UPDATE pipeline_runs
                SET status = 'failed', completed_at = now(),
                    error_summary = :summary
                WHERE id = :id
            """),
            {"id": run_id, "summary": str(e)[:500]},
        )
        db.commit()
        raise
    finally:
        db.close()


@job
def etl_job():
    run_etl()
