import logging
import os

import pandas as pd
from dagster import (
    AssetExecutionContext,
    DynamicPartitionsDefinition,
    MaterializeResult,
    MetadataValue,
    asset,
)
from google.cloud import bigquery
from sqlalchemy import text

from izakaya_pipeline.assets.validation import get_column_defs, validate_row
from izakaya_pipeline.resources import BigQueryResource, DatabaseResource

logger = logging.getLogger(__name__)

dataset_partitions = DynamicPartitionsDefinition(name="dataset_id")


def _get_run_context(context: AssetExecutionContext, db_session):
    """Extract dataset_id, run_id, dataset_type, and bq config from context and DB."""
    dataset_id = int(context.partition_key)
    run_id = int(context.run.tags["pipeline_run_id"])

    row = db_session.execute(
        text("SELECT type FROM datasets WHERE id = :id"), {"id": dataset_id}
    ).fetchone()
    if not row:
        raise ValueError(f"Dataset {dataset_id} not found")
    dataset_type = row[0]

    bq_dataset = os.getenv("BQ_DATASET", "izakaya_warehouse")
    bq_project = os.getenv("BQ_PROJECT_ID", "")

    return dataset_id, run_id, dataset_type, bq_dataset, bq_project


def _fail_run(db_session, run_id: int, summary: str):
    """Mark a pipeline run as failed."""
    db_session.execute(
        text("""
            UPDATE pipeline_runs
            SET status = 'failed', completed_at = now(), error_summary = :summary
            WHERE id = :id
        """),
        {"id": run_id, "summary": summary[:500]},
    )
    db_session.commit()


@asset(partitions_def=dataset_partitions)
def mapped_dataset(
    context: AssetExecutionContext,
    database: DatabaseResource,
    bigquery_resource: BigQueryResource,
) -> MaterializeResult:
    """Read BQ sources, apply column mappings, merge into a staging table."""
    db = database.get_session()
    bq = bigquery_resource.get_client()

    try:
        dataset_id, run_id, dataset_type, bq_dataset, bq_project = _get_run_context(context, db)

        # Update run status to running
        db.execute(
            text("UPDATE pipeline_runs SET status = 'running', started_at = now() WHERE id = :id"),
            {"id": run_id},
        )
        db.commit()

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

        if not sources:
            _fail_run(db, run_id, "No mapped data sources found")
            raise ValueError("No mapped data sources found")

        frames = []
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
            col_mapping = {}
            static_mapping = {}
            for r in mapping_rows:
                source_col, target_col, static_val = r
                if static_val is not None:
                    static_mapping[target_col] = static_val
                elif source_col:
                    col_mapping[source_col] = target_col

            # Read from BQ
            if col_mapping:
                source_cols = ", ".join(f"`{sc}`" for sc in col_mapping.keys())
                query = f"SELECT {source_cols} FROM `{bq_project}.{schema_name}.{bq_table}`"
                try:
                    df = bq.query(query).to_dataframe()
                except Exception as e:
                    logger.error(f"Failed to read BQ table {schema_name}.{bq_table}: {e}")
                    continue
                df = df.rename(columns=col_mapping)
            else:
                query = f"SELECT COUNT(*) as cnt FROM `{bq_project}.{schema_name}.{bq_table}`"
                try:
                    row_count = bq.query(query).to_dataframe().iloc[0]["cnt"]
                except Exception as e:
                    logger.error(f"Failed to read BQ table {schema_name}.{bq_table}: {e}")
                    continue
                df = pd.DataFrame(index=range(row_count))

            # Add static value columns
            for target_col, static_val in static_mapping.items():
                df[target_col] = static_val

            # Track source origin
            df["__data_source_id"] = source_id
            frames.append(df)

        if not frames:
            _fail_run(db, run_id, "No data read from any source")
            raise ValueError("No data read from any source")

        merged = pd.concat(frames, ignore_index=True)

        # Write to staging table
        staging_table = f"{bq_project}.{bq_dataset}.{dataset_type}_mapped"
        job_config = bigquery.LoadJobConfig(
            write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        )
        load_job = bq.load_table_from_dataframe(merged, staging_table, job_config=job_config)
        load_job.result()
        logger.info(f"Wrote {len(merged)} rows to {staging_table}")

        return MaterializeResult(
            metadata={
                "row_count": MetadataValue.int(len(merged)),
                "source_count": MetadataValue.int(len(frames)),
                "staging_table": MetadataValue.text(staging_table),
            }
        )

    except Exception as e:
        logger.exception(f"mapped_dataset failed for dataset {context.partition_key}")
        try:
            run_id = int(context.run.tags["pipeline_run_id"])
            _fail_run(db, run_id, str(e))
        except Exception:
            pass
        raise
    finally:
        db.close()


@asset(partitions_def=dataset_partitions, deps=[mapped_dataset])
def labelled_dataset(
    context: AssetExecutionContext,
    database: DatabaseResource,
    bigquery_resource: BigQueryResource,
) -> MaterializeResult:
    """Apply label rules to mapped data and track coverage."""
    db = database.get_session()
    bq = bigquery_resource.get_client()

    try:
        dataset_id, run_id, dataset_type, bq_dataset, bq_project = _get_run_context(context, db)

        # Read from mapped staging table
        mapped_table = f"{bq_project}.{bq_dataset}.{dataset_type}_mapped"
        query = f"SELECT * FROM `{mapped_table}`"
        df = bq.query(query).to_dataframe()

        # Load label rules for this dataset, grouped by column
        label_rows = db.execute(
            text("""
                SELECT column_name, match_value, replace_value
                FROM label_rules WHERE dataset_id = :id
            """),
            {"id": dataset_id},
        ).fetchall()
        rules_by_col: dict[str, dict[str, str]] = {}
        for col_name, match_val, replace_val in label_rows:
            rules_by_col.setdefault(col_name, {})[match_val.lower().strip()] = replace_val

        # Compute __fully_labelled before applying rules
        fully_labelled = pd.Series(True, index=df.index)
        for col_name, lower_map in rules_by_col.items():
            if col_name in df.columns:
                temp = df[col_name].astype(str).str.lower().str.strip()
                fully_labelled &= temp.isin(lower_map.keys())

        # Apply label rules (case-insensitive replacement)
        for col_name, lower_map in rules_by_col.items():
            if col_name in df.columns:
                temp = df[col_name].astype(str).str.lower().str.strip()
                mapped = temp.map(lower_map)
                mask = mapped.notna()
                df.loc[mask, col_name] = mapped[mask]

        df["__fully_labelled"] = fully_labelled

        # Write ALL rows to labelled table
        labelled_table = f"{bq_project}.{bq_dataset}.{dataset_type}_labelled"
        job_config = bigquery.LoadJobConfig(
            write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        )
        load_job = bq.load_table_from_dataframe(df, labelled_table, job_config=job_config)
        load_job.result()

        fully_labelled_count = int(fully_labelled.sum())
        coverage_pct = round(fully_labelled_count / len(df) * 100, 1) if len(df) > 0 else 0.0
        logger.info(
            f"Wrote {len(df)} rows to {labelled_table} "
            f"({fully_labelled_count} fully labelled, {coverage_pct}% coverage)"
        )

        return MaterializeResult(
            metadata={
                "row_count": MetadataValue.int(len(df)),
                "fully_labelled_count": MetadataValue.int(fully_labelled_count),
                "coverage_pct": MetadataValue.float(coverage_pct),
            }
        )

    except Exception as e:
        logger.exception(f"labelled_dataset failed for dataset {context.partition_key}")
        try:
            run_id = int(context.run.tags["pipeline_run_id"])
            _fail_run(db, run_id, str(e))
        except Exception:
            pass
        raise
    finally:
        db.close()


@asset(partitions_def=dataset_partitions, deps=[labelled_dataset])
def datamart(
    context: AssetExecutionContext,
    database: DatabaseResource,
    bigquery_resource: BigQueryResource,
) -> MaterializeResult:
    """Filter to fully labelled rows, validate, and write clean output."""
    db = database.get_session()
    bq = bigquery_resource.get_client()

    try:
        dataset_id, run_id, dataset_type, bq_dataset, bq_project = _get_run_context(context, db)

        # Read from labelled table
        labelled_table = f"{bq_project}.{bq_dataset}.{dataset_type}_labelled"
        query = f"SELECT * FROM `{labelled_table}`"
        df = bq.query(query).to_dataframe()

        rows_input = len(df)

        # Filter to fully labelled rows only
        df_labelled = df[df["__fully_labelled"] == True].copy()  # noqa: E712
        rows_fully_labelled = len(df_labelled)

        # Load column defs for validation
        column_defs = get_column_defs(dataset_type)

        all_valid_rows: list[dict] = []
        all_errors: list[dict] = []

        for idx, row_data in df_labelled.iterrows():
            row_num = int(idx) + 1
            data_source_id = int(row_data.get("__data_source_id", 0))
            clean_row, row_errors = validate_row(
                row_data.to_dict(), row_num, column_defs, data_source_id
            )
            all_errors.extend(row_errors)
            if clean_row and not any(
                e["error_type"] == "missing_required" for e in row_errors
            ):
                all_valid_rows.append(clean_row)

        # Write valid rows to datamart table
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

        # Determine final status
        rows_failed = len(all_errors)
        if not all_valid_rows:
            status = "failed"
            if rows_fully_labelled == 0:
                error_summary = f"No fully labelled rows (0 of {rows_input} rows matched all label rules)"
            else:
                error_summary = f"All {rows_fully_labelled} labelled rows failed validation ({rows_failed} errors)"
        else:
            status = "success"
            error_summary = f"{rows_failed} validation errors" if all_errors else None

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
                "failed": rows_failed,
                "summary": error_summary,
            },
        )
        db.commit()

        return MaterializeResult(
            metadata={
                "rows_input": MetadataValue.int(rows_input),
                "rows_fully_labelled": MetadataValue.int(rows_fully_labelled),
                "rows_valid": MetadataValue.int(len(all_valid_rows)),
                "rows_failed": MetadataValue.int(rows_failed),
                "output_table": MetadataValue.text(output_table),
            }
        )

    except Exception as e:
        logger.exception(f"datamart failed for dataset {context.partition_key}")
        try:
            run_id = int(context.run.tags["pipeline_run_id"])
            _fail_run(db, run_id, str(e))
        except Exception:
            pass
        raise
    finally:
        db.close()
