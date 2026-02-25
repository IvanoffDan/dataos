"""Auto-label asset — AI-powered string value standardization for new data sources."""
import logging

from dagster import AssetExecutionContext, MaterializeResult, MetadataValue, RetryPolicy, asset

from izakaya_pipeline.assets.partitions import dataset_partitions
from izakaya_pipeline.dataset_types import get_dataset_type
from izakaya_pipeline.dataset_types.base import DataType
from izakaya_pipeline.infra.ai import chat_json
from izakaya_pipeline.infra.bigquery import get_column_value_frequencies
from izakaya_pipeline.infra.prompts import AUTOLABEL_SYSTEM
from izakaya_pipeline.repositories import automation_repo
from izakaya_pipeline.resources import BigQueryResource, DatabaseResource

logger = logging.getLogger(__name__)


@asset(
    partitions_def=dataset_partitions,
    retry_policy=RetryPolicy(max_retries=2, delay=30),
)
def auto_label_asset(
    context: AssetExecutionContext,
    database: DatabaseResource,
    bigquery_resource: BigQueryResource,
) -> MaterializeResult:
    """AI-powered string value standardization for a data source in auto_labelling status."""
    ds_id = int(context.partition_key)
    db = database.get_session()
    bq = bigquery_resource.get_client()
    project = bigquery_resource.project_id
    bq_dataset = bigquery_resource.dataset

    try:
        # 1. Load data source details
        ds_info = automation_repo.get_ds_with_connector(db, ds_id)
        if not ds_info:
            raise ValueError(f"Data source {ds_id} not found")

        dataset_type = ds_info["dataset_type"]

        # 2. Load dataset type definition
        dt = get_dataset_type(dataset_type)
        if not dt:
            raise ValueError(f"Unknown dataset type: {dataset_type}")

        # 3. Get string columns
        string_cols = [c for c in dt.columns if c.data_type == DataType.STRING]
        if not string_cols:
            context.log.info(f"No string columns for DS {ds_id}, skipping auto-label")
            automation_repo.update_ds_status(db, ds_id, "pending_review")
            return MaterializeResult(
                metadata={
                    "data_source_id": MetadataValue.int(ds_id),
                    "columns_processed": MetadataValue.int(0),
                    "total_rules_created": MetadataValue.int(0),
                }
            )

        # 4. For each string column: get values, call AI, save rules
        total_rules = 0
        columns_processed = 0

        # Use the datamart output table (dataset_type name is the table)
        for col in string_cols:
            context.log.info(f"Auto-labelling column '{col.name}' for DS {ds_id}")

            # Get existing rules for context
            existing = automation_repo.get_existing_label_rules(db, dataset_type, col.name)
            mapped_lower = {r["match_value"].lower().strip() for r in existing}
            canonical_values = sorted({
                r["replace_value"] for r in existing if not r["ai_suggested"]
            })

            # Get distinct values from the datamart table
            bq_values = get_column_value_frequencies(
                bq, project, bq_dataset, dataset_type, col.name
            )
            if bq_values is None or len(bq_values) == 0:
                context.log.info(f"No data for column '{col.name}', skipping")
                continue

            # Filter to unmapped values only
            unmapped = [v for v in bq_values if v["value"].lower().strip() not in mapped_lower]
            if not unmapped:
                context.log.info(f"All values already mapped for '{col.name}', skipping")
                continue

            # Build prompt
            values_text = "\n".join(f'{v["value"]} ({v["count"]} rows)' for v in unmapped)
            canonical_text = ", ".join(canonical_values) if canonical_values else "(none yet)"
            user_message = (
                f"Column: {col.name}\n"
                f"Description: {col.description}\n"
                f"Dataset: {dt.name} — {dt.description}\n\n"
                f"Existing canonical values (user-approved): {canonical_text}\n\n"
                f"Unmapped values to standardize:\n{values_text}"
            )

            # Call AI
            result = chat_json(AUTOLABEL_SYSTEM, user_message)
            if not isinstance(result, list):
                context.log.warning(f"AI returned invalid response for column '{col.name}'")
                continue

            # Filter valid suggestions
            valid_rules = []
            for item in result:
                try:
                    value = str(item["value"])
                    replacement = str(item["replacement"])
                    confidence = max(0.0, min(1.0, float(item.get("confidence", 0))))
                except (KeyError, TypeError, ValueError):
                    continue
                valid_rules.append({
                    "value": value,
                    "replacement": replacement,
                    "confidence": confidence,
                })

            if valid_rules:
                automation_repo.save_label_rules(db, dataset_type, col.name, valid_rules)
                total_rules += len(valid_rules)

            columns_processed += 1
            context.log.info(
                f"Created {len(valid_rules)} rules for column '{col.name}'"
            )

        # 5. Update status to pending_review
        automation_repo.update_ds_status(db, ds_id, "pending_review")
        context.log.info(f"DS {ds_id} moved to pending_review ({total_rules} total rules)")

        return MaterializeResult(
            metadata={
                "data_source_id": MetadataValue.int(ds_id),
                "columns_processed": MetadataValue.int(columns_processed),
                "total_rules_created": MetadataValue.int(total_rules),
            }
        )

    except Exception:
        logger.exception(f"Auto-label failed for DS {ds_id}")
        automation_repo.update_ds_status(db, ds_id, "processing_failed")
        raise
    finally:
        db.close()
