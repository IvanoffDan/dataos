"""dbt staging asset — runs a dbt model per connector to produce a normalized staging table.

After dbt completes, creates pending pipeline runs for mapped data sources so the
existing ETL (mapped → labelled → datamart) picks them up.
"""

import json
import logging
import os
import subprocess

from dagster import (
    AssetExecutionContext,
    DynamicPartitionsDefinition,
    MaterializeResult,
    MetadataValue,
    RetryPolicy,
    asset,
)

from izakaya_pipeline.repositories import data_source_repo, pipeline_run_repo
from izakaya_pipeline.resources import DatabaseResource
from izakaya_pipeline.transforms.registry import ConnectorCategory, get_transform_config

logger = logging.getLogger(__name__)

connector_partitions = DynamicPartitionsDefinition(name="connector_id")

DBT_PROJECT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "dbt")


@asset(
    partitions_def=connector_partitions,
    retry_policy=RetryPolicy(max_retries=2, delay=30),
)
def dbt_staging(
    context: AssetExecutionContext,
    database: DatabaseResource,
) -> MaterializeResult:
    """Run dbt model for a connector, producing a normalized staging table."""
    with database.session() as db:
        connector_id = int(context.partition_key)

        # Look up connector details
        conn_info = data_source_repo.get_connector_for_transform(db, connector_id)
        if not conn_info:
            raise ValueError(f"Connector {connector_id} not found")

        service, schema_name = conn_info
        config = get_transform_config(service)
        bq_project = os.getenv("BQ_PROJECT_ID", "")

        # Build dbt vars
        dbt_vars: dict[str, str] = {
            "target_schema": schema_name,
            "bq_project": bq_project,
        }

        # For DB/FS/passthrough: pass the raw source table name
        if config.category in (
            ConnectorCategory.DB,
            ConnectorCategory.FILE_SYSTEM,
            ConnectorCategory.PASSTHROUGH,
        ):
            raw_table = data_source_repo.get_raw_table_for_source(db, connector_id)
            if raw_table:
                dbt_vars["source_table"] = raw_table

        vars_json = json.dumps(dbt_vars)

        # Run dbt
        cmd = [
            "dbt", "run",
            "--select", config.dbt_model,
            "--vars", vars_json,
            "--full-refresh",
            "--project-dir", DBT_PROJECT_DIR,
            "--profiles-dir", DBT_PROJECT_DIR,
        ]
        logger.info(f"Running dbt for connector {connector_id} ({service}): {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)

        if result.returncode != 0:
            logger.error(f"dbt failed for connector {connector_id}: {result.stderr[-500:]}")
            raise RuntimeError(f"dbt run failed: {result.stderr[-500:]}")

        logger.info(f"dbt succeeded for connector {connector_id} ({service}/{schema_name})")

        # Create pending ETL runs for all mapped data sources on this connector
        ds_ids = data_source_repo.get_mapped_source_ids_for_connector(db, connector_id)
        for ds_id in ds_ids:
            pipeline_run_repo.create_pending_run(db, ds_id)

        return MaterializeResult(
            metadata={
                "connector_id": MetadataValue.int(connector_id),
                "service": MetadataValue.text(service),
                "dbt_model": MetadataValue.text(config.dbt_model),
                "data_sources_triggered": MetadataValue.int(len(ds_ids)),
                "dbt_stdout": MetadataValue.text(result.stdout[-2000:]),
            }
        )
