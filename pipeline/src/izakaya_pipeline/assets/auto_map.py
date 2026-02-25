"""Auto-map asset — AI-powered column mapping for new data sources."""
import logging
import os

from dagster import AssetExecutionContext, MaterializeResult, MetadataValue, RetryPolicy, asset

from izakaya_pipeline.assets.partitions import dataset_partitions
from izakaya_pipeline.dataset_types import get_dataset_type
from izakaya_pipeline.dataset_types.base import DataType
from izakaya_pipeline.infra.ai import chat_json
from izakaya_pipeline.infra.bigquery import get_sample_values, get_table_columns
from izakaya_pipeline.infra.prompts import AUTOMAP_SYSTEM
from izakaya_pipeline.repositories import automation_repo
from izakaya_pipeline.resources import BigQueryResource, DatabaseResource

logger = logging.getLogger(__name__)


@asset(
    partitions_def=dataset_partitions,
    retry_policy=RetryPolicy(max_retries=2, delay=30),
)
def auto_map_asset(
    context: AssetExecutionContext,
    database: DatabaseResource,
    bigquery_resource: BigQueryResource,
) -> MaterializeResult:
    """AI-powered column mapping for a data source in auto_mapping status."""
    ds_id = int(context.partition_key)
    db = database.get_session()
    bq = bigquery_resource.get_client()
    project = bigquery_resource.project_id

    try:
        # 1. Load data source + connector details
        ds_info = automation_repo.get_ds_with_connector(db, ds_id)
        if not ds_info:
            raise ValueError(f"Data source {ds_id} not found")

        dataset_type = ds_info["dataset_type"]
        schema_name = ds_info["schema_name"]
        bq_table = ds_info["bq_table"]

        # 2. Load dataset type definition
        dt = get_dataset_type(dataset_type)
        if not dt:
            raise ValueError(f"Unknown dataset type: {dataset_type}")

        # 3. Get source columns + samples from BQ staging table
        source_cols = get_table_columns(bq, project, schema_name, bq_table)
        source_col_names = [c["name"] for c in source_cols]
        samples = get_sample_values(bq, project, schema_name, bq_table, source_col_names)

        # 4. Build prompt (same logic as backend auto_map)
        target_lines = []
        for col in dt.columns:
            parts = [f"  - {col.name} ({col.data_type.value}): {col.description}"]
            if col.required:
                parts.append("    [REQUIRED]")
            if col.format:
                parts.append(f"    format: {col.format}")
            if col.max_length:
                parts.append(f"    max_length: {col.max_length}")
            if col.min_value is not None:
                parts.append(f"    min_value: {col.min_value}")
            target_lines.append("\n".join(parts))

        source_lines = []
        for sc in source_cols:
            sample_vals = samples.get(sc["name"], [])
            sample_str = ", ".join(f'"{v}"' for v in sample_vals[:5]) if sample_vals else "(no samples)"
            source_lines.append(f"  - {sc['name']} ({sc['type']}): {sample_str}")

        user_message = (
            f"Dataset: {dt.name} — {dt.description}\n\n"
            f"TARGET COLUMNS (all need mapping):\n"
            + "\n".join(target_lines)
            + f"\n\nSOURCE COLUMNS (from BQ table {bq_table}):\n"
            + "\n".join(source_lines)
        )

        # 5. Call Anthropic
        context.log.info(f"Calling AI for auto-map on DS {ds_id}")
        result = chat_json(AUTOMAP_SYSTEM, user_message)

        if not isinstance(result, list):
            raise ValueError("AI returned invalid response (expected array)")

        # 6. Parse and save mappings
        target_names = {c.name for c in dt.columns}
        mappings = []
        for item in result:
            try:
                target = str(item["target_column"])
                source = item.get("source_column")
                static = item.get("static_value")
            except (KeyError, TypeError):
                continue

            if target not in target_names:
                continue
            if not source and not static:
                continue

            mappings.append({
                "target_column": target,
                "source_column": source if source else None,
                "static_value": static if static else None,
            })

        automation_repo.save_mappings(db, ds_id, mappings)
        context.log.info(f"Saved {len(mappings)} mappings for DS {ds_id}")

        # 7. Create PipelineRun(status='pending') for ETL
        if not automation_repo.has_pending_run(db, ds_id):
            automation_repo.create_pending_run(db, ds_id)

        # 8. Update status to auto_labelling
        automation_repo.update_ds_status(db, ds_id, "auto_labelling")
        context.log.info(f"DS {ds_id} moved to auto_labelling")

        return MaterializeResult(
            metadata={
                "data_source_id": MetadataValue.int(ds_id),
                "mappings_created": MetadataValue.int(len(mappings)),
                "dataset_type": MetadataValue.text(dataset_type),
            }
        )

    except Exception:
        logger.exception(f"Auto-map failed for DS {ds_id}")
        automation_repo.update_ds_status(db, ds_id, "processing_failed")
        raise
    finally:
        db.close()
