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
from izakaya_api.domains.data_sources.schemas import (
    AutoMapResponse,
    AutoMapSuggestion,
    DataSourceResponse,
    ReviewContextResponse,
    ReviewLabelColumn,
    ReviewLabelRule,
    ReviewMapping,
    ReviewSummary,
)
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
            mappings_accepted=ds.mappings_accepted,
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
            status="auto_mapping",
        )
        self.ds_repo.create(ds)

        # For auto_mapping, the automation pipeline handles the full flow.
        # The staging table already exists from prior dbt runs (if connector is synced)
        # or will be created by fivetran_sync_sensor → dbt when the connector first syncs.

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

    def save_mappings(self, data_source_id: int, mappings: list[dict], auto_mode: bool = False) -> list[Mapping]:
        ds = self._get_ds(data_source_id)
        self.mapping_repo.delete_by_data_source(data_source_id)
        new_mappings = []
        for item in mappings:
            m = Mapping(
                data_source_id=data_source_id,
                source_column=item["source_column"] or None,
                target_column=item["target_column"],
                static_value=item.get("static_value"),
                confidence=item.get("confidence"),
                reasoning=item.get("reasoning"),
                ai_suggested=item.get("ai_suggested"),
            )
            self.mapping_repo.create(m)
            new_mappings.append(m)
        if not auto_mode:
            ds.status = "mapped" if mappings else "pending_mapping"
        if not self.run_repo.has_pending(data_source_id):
            self.run_repo.create(PipelineRun(data_source_id=data_source_id, status="pending"))
        return new_mappings

    def approve(self, data_source_id: int) -> DataSourceResponse:
        ds = self._get_ds(data_source_id)
        if ds.status != "pending_review":
            raise DomainValidationError(
                f"Cannot approve data source in '{ds.status}' status (expected 'pending_review')"
            )
        ds.status = "mapped"
        ds.mappings_accepted = False  # reset for next cycle
        if not self.run_repo.has_pending(data_source_id):
            self.run_repo.create(PipelineRun(data_source_id=data_source_id, status="pending"))
        return self._build_response(ds)

    def accept_mappings(self, data_source_id: int, reprocess: bool = False) -> DataSourceResponse:
        """Accept mappings and optionally trigger re-processing for labels."""
        ds = self._get_ds(data_source_id)
        if ds.status != "pending_review":
            raise DomainValidationError(
                f"Cannot accept mappings in '{ds.status}' status (expected 'pending_review')"
            )
        ds.mappings_accepted = True
        if reprocess:
            ds.status = "auto_labelling"
            if not self.run_repo.has_pending(data_source_id):
                self.run_repo.create(PipelineRun(data_source_id=data_source_id, status="pending"))
        return self._build_response(ds)

    def reset_mappings_accepted(self, data_source_id: int) -> DataSourceResponse:
        """Go back to mapping review step."""
        ds = self._get_ds(data_source_id)
        ds.mappings_accepted = False
        return self._build_response(ds)

    def retry(self, data_source_id: int) -> DataSourceResponse:
        ds = self._get_ds(data_source_id)
        if ds.status != "processing_failed":
            raise DomainValidationError(
                f"Cannot retry data source in '{ds.status}' status (expected 'processing_failed')"
            )
        resume_status = "auto_labelling" if self.mapping_repo.has_mappings(data_source_id) else "auto_mapping"
        ds.status = resume_status
        self.run_repo.create(PipelineRun(data_source_id=data_source_id, status="pending"))
        return self._build_response(ds)

    def get_mappings(self, data_source_id: int) -> list[Mapping]:
        self._get_ds(data_source_id)
        return self.mapping_repo.list_by_data_source(data_source_id)

    def patch_mapping(
        self, data_source_id: int, target_column: str, data: dict, label_repo=None
    ) -> Mapping:
        from izakaya_api.dataset_types.base import DataType

        ds = self._get_ds(data_source_id)
        mapping = self.mapping_repo.get_by_target(data_source_id, target_column)
        if not mapping:
            mapping = Mapping(
                data_source_id=data_source_id,
                target_column=target_column,
            )
            self.mapping_repo.create(mapping)

        old_source = mapping.source_column
        old_static = mapping.static_value

        if "source_column" in data:
            mapping.source_column = data["source_column"] or None
            if mapping.source_column:
                mapping.static_value = None
            mapping.ai_suggested = False
            mapping.confidence = None
            mapping.reasoning = None
        if "static_value" in data:
            mapping.static_value = data["static_value"] or None
            if mapping.static_value:
                mapping.source_column = None
            mapping.ai_suggested = False
            mapping.confidence = None
            mapping.reasoning = None

        # If the source changed for a string column, clear stale AI labels
        source_changed = (mapping.source_column != old_source) or (mapping.static_value != old_static)
        if source_changed and label_repo:
            dt = get_dataset_type(ds.dataset_type)
            if dt:
                col_def = next((c for c in dt.columns if c.name == target_column), None)
                if col_def and col_def.data_type == DataType.STRING:
                    label_repo.delete_ai_by_column(ds.dataset_type, target_column)

        return mapping

    def reprocess(self, data_source_id: int) -> DataSourceResponse:
        """Re-run pipeline + auto-label after mapping edits."""
        ds = self._get_ds(data_source_id)
        if ds.status not in ("pending_review", "mapped", "processing_failed"):
            raise DomainValidationError(
                f"Cannot reprocess data source in '{ds.status}' status"
            )
        ds.status = "auto_labelling"
        ds.mappings_accepted = True
        if not self.run_repo.has_pending(data_source_id):
            self.run_repo.create(PipelineRun(data_source_id=data_source_id, status="pending"))
        return self._build_response(ds)

    def get_review_context(
        self, data_source_id: int, label_service=None
    ) -> ReviewContextResponse:
        from izakaya_api.dataset_types.base import DataType

        ds = self._get_ds(data_source_id)
        ds_response = self._build_response(ds)
        dt = get_dataset_type(ds.dataset_type)
        if not dt:
            raise DomainValidationError(f"Unknown dataset type: {ds.dataset_type}")

        connector = self.connector_repo.get(ds.connector_id)

        # Build mapping lookup
        existing_mappings = self.mapping_repo.list_by_data_source(data_source_id)
        mapping_by_target = {m.target_column: m for m in existing_mappings}

        # Get sample values for mapped source columns
        samples: dict[str, list[str]] = {}
        if connector and connector.schema_name:
            mapped_source_cols = [
                m.source_column for m in existing_mappings if m.source_column
            ]
            if mapped_source_cols:
                try:
                    samples = get_sample_values(
                        connector.schema_name, ds.bq_table, mapped_source_cols, limit=5
                    )
                except Exception:
                    logger.warning("Failed to get sample values", exc_info=True)

        # Build review mappings
        review_mappings: list[ReviewMapping] = []
        for col in dt.columns:
            m = mapping_by_target.get(col.name)
            review_mappings.append(
                ReviewMapping(
                    target_column=col.name,
                    target_type=col.data_type.value,
                    target_description=col.description,
                    target_required=col.required,
                    source_column=m.source_column if m else None,
                    static_value=m.static_value if m else None,
                    confidence=m.confidence if m else None,
                    reasoning=m.reasoning if m else None,
                    ai_suggested=m.ai_suggested if m else None,
                    sample_values=samples.get(m.source_column, []) if m and m.source_column else [],
                )
            )

        # Build label columns data
        label_columns: list[ReviewLabelColumn] = []
        string_cols = [
            c for c in dt.columns
            if c.data_type == DataType.STRING
            and c.name in mapping_by_target
            and (mapping_by_target[c.name].source_column or mapping_by_target[c.name].static_value)
        ]

        if label_service and string_cols:
            for col in string_cols:
                try:
                    col_values = label_service.get_column_values(ds.dataset_type, col.name)
                    rules: list[ReviewLabelRule] = []
                    for v in col_values.values[:50]:
                        if v.replacement is not None:
                            rules.append(
                                ReviewLabelRule(
                                    id=0,
                                    match_value=v.value,
                                    replace_value=v.replacement,
                                    row_count=v.row_count,
                                    percentage=v.percentage,
                                    ai_suggested=v.ai_suggested,
                                    confidence=v.confidence,
                                )
                            )

                    total_rows = col_values.total_rows or 0
                    covered = col_values.covered_row_count
                    row_cov = (covered / total_rows * 100) if total_rows > 0 else 0.0
                    distinct = col_values.distinct_count
                    rule_count = col_values.rule_count
                    cov_pct = (rule_count / distinct * 100) if distinct > 0 else 0.0

                    label_columns.append(
                        ReviewLabelColumn(
                            column_name=col.name,
                            description=col.description,
                            distinct_count=distinct,
                            rule_count=rule_count,
                            ai_rule_count=sum(1 for r in rules if r.ai_suggested),
                            coverage_pct=round(cov_pct, 1),
                            row_coverage_pct=round(row_cov, 1),
                            rules=rules,
                        )
                    )
                except Exception:
                    logger.warning("Failed to get label data for column %s", col.name, exc_info=True)

        # Summary stats
        mapped_count = sum(1 for rm in review_mappings if rm.source_column or rm.static_value)
        unmapped_required = sum(
            1 for rm in review_mappings
            if rm.target_required and not rm.source_column and not rm.static_value
        )
        high_conf = sum(
            1 for rm in review_mappings
            if rm.confidence is not None and rm.confidence >= 0.9
        )
        needs_review = sum(
            1 for rm in review_mappings
            if (rm.confidence is not None and rm.confidence < 0.9)
            or (rm.target_required and not rm.source_column and not rm.static_value)
        )
        total_label_rules = sum(lc.rule_count for lc in label_columns)
        total_row_cov = (
            sum(lc.row_coverage_pct for lc in label_columns) / len(label_columns)
            if label_columns else 0.0
        )

        summary = ReviewSummary(
            total_target_columns=len(dt.columns),
            mapped_count=mapped_count,
            unmapped_required_count=unmapped_required,
            high_confidence_count=high_conf,
            needs_review_count=needs_review,
            total_label_rules=total_label_rules,
            label_columns_count=len(label_columns),
            row_coverage_pct=round(total_row_cov, 1),
        )

        return ReviewContextResponse(
            data_source=ds_response,
            summary=summary,
            mappings=review_mappings,
            label_columns=label_columns,
        )

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
