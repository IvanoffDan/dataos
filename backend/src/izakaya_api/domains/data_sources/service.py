import logging

from izakaya_api.core.exceptions import ExternalServiceError, NotFoundError, ValidationError as DomainValidationError
from izakaya_api.dataset_types import get_dataset_type
from izakaya_api.domains.connectors.repository import ConnectorRepository
from izakaya_api.domains.connectors.transform_config import get_connector_category, get_staging_table, requires_table_selection
from izakaya_api.domains.data_sources.models import DataSource, Mapping, PipelineRun
from izakaya_api.domains.data_sources.repository import (
    DataSourceRepository,
    MappingRepository,
    PipelineRunRepository,
)
from izakaya_api.domains.data_sources.schemas import AutoMapResponse, AutoMapSuggestion, DataSourceResponse
from izakaya_api.infra.ai.client import chat_json
from izakaya_api.infra.ai.prompts import AUTOMAP_SYSTEM
from izakaya_api.infra.bigquery.table_service import get_sample_values, get_table_columns

logger = logging.getLogger(__name__)


class DataSourceService:
    def __init__(
        self,
        ds_repo: DataSourceRepository,
        mapping_repo: MappingRepository,
        run_repo: PipelineRunRepository,
        connector_repo: ConnectorRepository,
    ):
        self.ds_repo = ds_repo
        self.mapping_repo = mapping_repo
        self.run_repo = run_repo
        self.connector_repo = connector_repo

    def _get_ds(self, data_source_id: int) -> DataSource:
        ds = self.ds_repo.get(data_source_id)
        if not ds:
            raise NotFoundError("Data source not found")
        return ds

    def _build_response(self, ds: DataSource) -> DataSourceResponse:
        connector = self.connector_repo.get(ds.connector_id)
        category = get_connector_category(connector.service) if connector else "passthrough"
        return DataSourceResponse(
            id=ds.id,
            name=ds.name,
            description=ds.description,
            dataset_type=ds.dataset_type,
            connector_id=ds.connector_id,
            bq_table=ds.bq_table,
            raw_table=ds.raw_table,
            status=ds.status,
            created_at=ds.created_at,
            updated_at=ds.updated_at,
            connector_name=connector.name if connector else "",
            connector_category=category,
        )

    def list_all(self) -> list[DataSourceResponse]:
        sources = self.ds_repo.list_all()
        return [self._build_response(s) for s in sources]

    def get(self, data_source_id: int) -> DataSourceResponse:
        ds = self._get_ds(data_source_id)
        return self._build_response(ds)

    def create(
        self, name: str, description: str, dataset_type: str, connector_id: int, bq_table: str | None
    ) -> DataSourceResponse:
        if not get_dataset_type(dataset_type):
            raise DomainValidationError(f"Unknown dataset type: {dataset_type}")
        connector = self.connector_repo.get(connector_id)
        if not connector:
            raise NotFoundError("Connector not found")

        # Determine bq_table (staging) and raw_table based on connector category
        staging_table = get_staging_table(connector.service)
        if requires_table_selection(connector.service):
            if not bq_table:
                raise DomainValidationError("bq_table is required for this connector type")
            raw_table = bq_table
        else:
            raw_table = None

        ds = DataSource(
            name=name,
            description=description,
            dataset_type=dataset_type,
            connector_id=connector_id,
            bq_table=staging_table,
            raw_table=raw_table,
            status="pending_mapping",
        )
        self.ds_repo.create(ds)

        # If connector already synced, trigger initial dbt transform so staging table
        # exists before the user tries to map columns
        if connector.sync_state == "synced":
            self.run_repo.create(
                PipelineRun(data_source_id=ds.id, status="pending_transform")
            )

        return self._build_response(ds)

    def update(self, data_source_id: int, data: dict) -> DataSourceResponse:
        ds = self._get_ds(data_source_id)
        for key, value in data.items():
            setattr(ds, key, value)
        return self._build_response(ds)

    def delete(self, data_source_id: int) -> None:
        ds = self._get_ds(data_source_id)
        self.ds_repo.delete(ds)

    def trigger_run(self, data_source_id: int) -> PipelineRun:
        self._get_ds(data_source_id)
        run = PipelineRun(data_source_id=data_source_id, status="pending")
        self.run_repo.create(run)
        return run

    def list_runs(self, data_source_id: int) -> list[PipelineRun]:
        self._get_ds(data_source_id)
        return self.run_repo.list_by_data_source(data_source_id)

    def get_source_columns(self, data_source_id: int) -> list[dict]:
        ds = self._get_ds(data_source_id)
        connector = self.connector_repo.get(ds.connector_id)
        if not connector or not connector.schema_name:
            raise DomainValidationError("Connector has no BQ schema")
        return get_table_columns(connector.schema_name, ds.bq_table)

    def save_mappings(self, data_source_id: int, mappings: list[dict]) -> list[Mapping]:
        ds = self._get_ds(data_source_id)
        self.mapping_repo.delete_by_data_source(data_source_id)
        new_mappings = []
        for item in mappings:
            m = Mapping(
                data_source_id=data_source_id,
                source_column=item["source_column"] or None,
                target_column=item["target_column"],
                static_value=item.get("static_value"),
            )
            self.mapping_repo.create(m)
            new_mappings.append(m)
        ds.status = "mapped" if mappings else "pending_mapping"
        if not self.run_repo.has_pending(data_source_id):
            self.run_repo.create(PipelineRun(data_source_id=data_source_id, status="pending"))
        return new_mappings

    def get_mappings(self, data_source_id: int) -> list[Mapping]:
        self._get_ds(data_source_id)
        return self.mapping_repo.list_by_data_source(data_source_id)

    def auto_map(self, data_source_id: int) -> AutoMapResponse:
        ds = self._get_ds(data_source_id)
        dt = get_dataset_type(ds.dataset_type)
        if not dt:
            raise DomainValidationError(f"Unknown dataset type: {ds.dataset_type}")

        connector = self.connector_repo.get(ds.connector_id)
        if not connector or not connector.schema_name:
            raise DomainValidationError("Connector has no BQ schema")

        existing_mappings = self.mapping_repo.list_by_data_source(data_source_id)
        mapped_targets = {m.target_column for m in existing_mappings if m.source_column or m.static_value}
        used_sources = {m.source_column for m in existing_mappings if m.source_column}

        unmapped_cols = [c for c in dt.columns if c.name not in mapped_targets]
        if not unmapped_cols:
            return AutoMapResponse(suggestions=[], skipped_count=len(dt.columns))

        source_cols = get_table_columns(connector.schema_name, ds.bq_table)
        source_col_names = [c["name"] for c in source_cols]
        samples = get_sample_values(connector.schema_name, ds.bq_table, source_col_names)

        target_lines = []
        for col in unmapped_cols:
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
            used_marker = " [ALREADY USED]" if sc["name"] in used_sources else ""
            sample_vals = samples.get(sc["name"], [])
            sample_str = ", ".join(f'"{v}"' for v in sample_vals[:5]) if sample_vals else "(no samples)"
            source_lines.append(f"  - {sc['name']} ({sc['type']}){used_marker}: {sample_str}")

        user_message = (
            f"Dataset: {dt.name} — {dt.description}\n\n"
            f"TARGET COLUMNS (unmapped — need suggestions):\n"
            + "\n".join(target_lines)
            + f"\n\nSOURCE COLUMNS (from BQ table {ds.bq_table}):\n"
            + "\n".join(source_lines)
        )

        try:
            result = chat_json(AUTOMAP_SYSTEM, user_message)
        except Exception:
            logger.exception("Auto-map AI call failed")
            raise ExternalServiceError("AI service error")

        if not isinstance(result, list):
            raise ExternalServiceError("AI returned invalid response")

        suggestions = []
        unmapped_names = {c.name for c in unmapped_cols}
        for item in result:
            try:
                target = str(item["target_column"])
                source = item.get("source_column")
                static = item.get("static_value")
                confidence = max(0.0, min(1.0, float(item.get("confidence", 0))))
                reasoning = str(item.get("reasoning", ""))
            except (KeyError, TypeError, ValueError):
                continue

            if target not in unmapped_names:
                continue

            suggestions.append(
                AutoMapSuggestion(
                    target_column=target,
                    source_column=source if source else None,
                    static_value=static if static else None,
                    confidence=confidence,
                    reasoning=reasoning,
                )
            )

        return AutoMapResponse(
            suggestions=suggestions,
            skipped_count=len(mapped_targets),
        )
