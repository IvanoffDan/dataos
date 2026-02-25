import logging
import os

import pandas as pd
from dagster import AssetExecutionContext, MaterializeResult, MetadataValue, RetryPolicy, asset
from google.cloud import bigquery

from izakaya_pipeline.assets.partitions import dataset_partitions
from izakaya_pipeline.repositories import data_source_repo, pipeline_run_repo
from izakaya_pipeline.resources import BigQueryResource, DatabaseResource
from izakaya_pipeline.transforms.mapping import apply_column_mappings

logger = logging.getLogger(__name__)


@asset(
    partitions_def=dataset_partitions,
    retry_policy=RetryPolicy(max_retries=2, delay=30),
)
def mapped_dataset(
    context: AssetExecutionContext,
    database: DatabaseResource,
    bigquery_resource: BigQueryResource,
) -> MaterializeResult:
    """Read BQ source, apply column mappings, write to a staging table."""
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

        # Update run status to running
        pipeline_run_repo.mark_running(db, run_id)

        # Load single data source
        source = data_source_repo.get_mapped_source(db, data_source_id)
        if not source:
            pipeline_run_repo.mark_failed(db, run_id, "Data source not found or not mapped")
            raise ValueError("Data source not found or not mapped")

        source_id, bq_table, _, schema_name = source

        # Load mappings for this source
        mapping_rows = data_source_repo.get_mappings(db, source_id)
        if not mapping_rows:
            pipeline_run_repo.mark_failed(db, run_id, "No mappings found for data source")
            raise ValueError("No mappings found for data source")

        # Separate column mappings from static mappings
        col_mapping = {}
        static_mapping = {}
        for source_col, target_col, static_val in mapping_rows:
            if static_val is not None:
                static_mapping[target_col] = static_val
            elif source_col:
                col_mapping[source_col] = target_col

        # Read from BQ
        if col_mapping:
            source_cols = ", ".join(f"`{sc}`" for sc in col_mapping.keys())
            query = f"SELECT {source_cols} FROM `{bq_project}.{schema_name}.{bq_table}`"
            df = bq.query(query).to_dataframe()
        else:
            query = f"SELECT COUNT(*) as cnt FROM `{bq_project}.{schema_name}.{bq_table}`"
            row_count = bq.query(query).to_dataframe().iloc[0]["cnt"]
            df = pd.DataFrame(index=range(row_count))

        # Apply transforms
        df = apply_column_mappings(df, col_mapping, static_mapping, source_id)

        # Write to staging table
        staging_table = f"{bq_project}.{bq_dataset}.{dataset_type}_mapped"
        job_config = bigquery.LoadJobConfig(
            write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        )
        load_job = bq.load_table_from_dataframe(df, staging_table, job_config=job_config)
        load_job.result()
        context.log.info(f"Wrote {len(df)} rows to {staging_table}")

        return MaterializeResult(
            metadata={
                "row_count": MetadataValue.int(len(df)),
                "staging_table": MetadataValue.text(staging_table),
            }
        )

    finally:
        db.close()
