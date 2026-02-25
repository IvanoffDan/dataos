import logging
import os

from dagster import AssetExecutionContext, MaterializeResult, MetadataValue, RetryPolicy, asset
from google.cloud import bigquery

from izakaya_pipeline.assets.mapped_dataset import mapped_dataset
from izakaya_pipeline.assets.partitions import dataset_partitions
from izakaya_pipeline.repositories import data_source_repo, label_rule_repo
from izakaya_pipeline.resources import BigQueryResource, DatabaseResource
from izakaya_pipeline.transforms.labelling import apply_label_rules

logger = logging.getLogger(__name__)


@asset(
    partitions_def=dataset_partitions,
    deps=[mapped_dataset],
    retry_policy=RetryPolicy(max_retries=2, delay=30),
)
def labelled_dataset(
    context: AssetExecutionContext,
    database: DatabaseResource,
    bigquery_resource: BigQueryResource,
) -> MaterializeResult:
    """Apply label rules to mapped data and track coverage."""
    db = database.get_session()
    bq = bigquery_resource.get_client()

    try:
        data_source_id = int(context.partition_key)

        dataset_type = data_source_repo.get_data_source_type(db, data_source_id)
        if not dataset_type:
            raise ValueError(f"DataSource {data_source_id} not found")

        bq_dataset = os.getenv("BQ_DATASET", "izakaya_warehouse")
        bq_project = os.getenv("BQ_PROJECT_ID", "")

        # Read from mapped staging table
        mapped_table = f"{bq_project}.{bq_dataset}.{dataset_type}_mapped"
        query = f"SELECT * FROM `{mapped_table}`"
        df = bq.query(query).to_dataframe()

        # Load label rules
        rules_by_col = label_rule_repo.get_rules_by_type(db, dataset_type)

        # Apply transforms
        df, stats = apply_label_rules(df, rules_by_col)

        # Write ALL rows to labelled table
        labelled_table = f"{bq_project}.{bq_dataset}.{dataset_type}_labelled"
        job_config = bigquery.LoadJobConfig(
            write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        )
        load_job = bq.load_table_from_dataframe(df, labelled_table, job_config=job_config)
        load_job.result()

        context.log.info(
            f"Wrote {stats['row_count']} rows to {labelled_table} "
            f"({stats['fully_labelled_count']} fully labelled, {stats['coverage_pct']}% coverage)"
        )

        return MaterializeResult(
            metadata={
                "row_count": MetadataValue.int(stats["row_count"]),
                "fully_labelled_count": MetadataValue.int(stats["fully_labelled_count"]),
                "coverage_pct": MetadataValue.float(stats["coverage_pct"]),
            }
        )

    finally:
        db.close()
