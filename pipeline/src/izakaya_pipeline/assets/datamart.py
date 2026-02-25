import logging
import os
from datetime import datetime, timezone

import pandas as pd
from dagster import AssetExecutionContext, MaterializeResult, MetadataValue, RetryPolicy, asset
from google.cloud import bigquery

from izakaya_pipeline.assets.labelled_dataset import labelled_dataset
from izakaya_pipeline.assets.partitions import dataset_partitions
from izakaya_pipeline.repositories import data_source_repo, pipeline_run_repo, validation_error_repo
from izakaya_pipeline.resources import BigQueryResource, DatabaseResource
from izakaya_pipeline.transforms.validation import get_column_defs, validate_dataframe

logger = logging.getLogger(__name__)


@asset(
    partitions_def=dataset_partitions,
    deps=[labelled_dataset],
    retry_policy=RetryPolicy(max_retries=2, delay=30),
)
def datamart(
    context: AssetExecutionContext,
    database: DatabaseResource,
    bigquery_resource: BigQueryResource,
) -> MaterializeResult:
    """Filter to fully labelled rows, validate, and write clean output."""
    db = database.get_session()
    bq = bigquery_resource.get_client()

    try:
        data_source_id = int(context.partition_key)
        run_id = int(context.run.tags["pipeline_run_id"])

        dataset_type = data_source_repo.get_data_source_type(db, data_source_id)
        if not dataset_type:
            raise ValueError(f"DataSource {data_source_id} not found")

        bq_dataset = os.getenv("BQ_DATASET", "izakaya_warehouse")
        bq_project = os.getenv("BQ_PROJECT_ID", "")

        # Read from labelled table
        labelled_table_name = f"{bq_project}.{bq_dataset}.{dataset_type}_labelled"
        query = f"SELECT * FROM `{labelled_table_name}`"
        df = bq.query(query).to_dataframe()

        rows_input = len(df)

        # Filter to fully labelled rows only
        df_labelled = df[df["__fully_labelled"] == True].copy()  # noqa: E712
        rows_fully_labelled = len(df_labelled)

        # Validate
        column_defs = get_column_defs(dataset_type)
        all_valid_rows, all_errors = validate_dataframe(df_labelled, column_defs, data_source_id)

        # Write valid rows to datamart table
        output_table = f"{bq_project}.{bq_dataset}.{dataset_type}"
        next_version = None
        if all_valid_rows:
            out_df = pd.DataFrame(all_valid_rows)
            job_config = bigquery.LoadJobConfig(
                write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
            )
            load_job = bq.load_table_from_dataframe(out_df, output_table, job_config=job_config)
            load_job.result()
            context.log.info(f"Wrote {len(all_valid_rows)} rows to {output_table}")

            # Compute next version and write to history table
            next_version = pipeline_run_repo.get_max_version(db, data_source_id) + 1

            history_df = out_df.copy()
            history_df["_version"] = next_version
            history_df["_pipeline_run_id"] = run_id
            history_df["_snapshot_at"] = datetime.now(timezone.utc)
            history_df["_data_source_id"] = data_source_id

            history_table = f"{bq_project}.{bq_dataset}.{dataset_type}_history"
            history_config = bigquery.LoadJobConfig(
                write_disposition=bigquery.WriteDisposition.WRITE_APPEND,
                schema_update_options=[
                    bigquery.SchemaUpdateOption.ALLOW_FIELD_ADDITION,
                ],
                time_partitioning=bigquery.TimePartitioning(
                    type_=bigquery.TimePartitioningType.DAY,
                    field="_snapshot_at",
                ),
                clustering_fields=["_data_source_id", "_version"],
            )
            history_job = bq.load_table_from_dataframe(history_df, history_table, job_config=history_config)
            history_job.result()
            context.log.info(f"Appended {len(history_df)} rows to {history_table} (version {next_version})")

        # Write validation errors to Postgres
        if all_errors:
            validation_error_repo.bulk_insert(db, run_id, all_errors)

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

        pipeline_run_repo.mark_completed(
            db, run_id,
            status=status,
            rows_processed=len(all_valid_rows),
            rows_failed=rows_failed,
            error_summary=error_summary,
            version=next_version,
        )

        return MaterializeResult(
            metadata={
                "rows_input": MetadataValue.int(rows_input),
                "rows_fully_labelled": MetadataValue.int(rows_fully_labelled),
                "rows_valid": MetadataValue.int(len(all_valid_rows)),
                "rows_failed": MetadataValue.int(rows_failed),
                "output_table": MetadataValue.text(output_table),
            }
        )

    finally:
        db.close()
