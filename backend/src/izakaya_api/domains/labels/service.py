import logging

from sqlalchemy import func
from sqlalchemy.orm import Session

from izakaya_api.config import settings
from izakaya_api.core.exceptions import NotFoundError, ServiceUnavailableError
from izakaya_api.dataset_types import get_dataset_type, list_dataset_types
from izakaya_api.dataset_types.base import DataType
from izakaya_api.domains.data_sources.models import DataSource, PipelineRun
from izakaya_api.domains.labels.models import LabelRule
from izakaya_api.domains.labels.repository import LabelRuleRepository
from izakaya_api.domains.labels.schemas import (
    AutoLabelAllResponse,
    AutoLabelColumnResult,
    AutoLabelResponse,
    AutoLabelSuggestion,
    ColumnStats,
    ColumnStatsResponse,
    ColumnValuesResponse,
    DatasetLabelSummary,
    DistinctValue,
    LabelRuleResponse,
)
from izakaya_api.infra.ai.client import chat_json
from izakaya_api.infra.ai.prompts import AUTOLABEL_SYSTEM
from izakaya_api.infra.bigquery.queries import (
    get_column_stats,
    get_column_value_frequencies,
    get_total_row_count,
)

logger = logging.getLogger(__name__)


def _get_string_columns(dataset_type_id: str) -> list[dict]:
    dt = get_dataset_type(dataset_type_id)
    if not dt:
        return []
    return [
        {"name": c.name, "description": c.description}
        for c in dt.columns
        if c.data_type == DataType.STRING
    ]


class LabelService:
    def __init__(self, repo: LabelRuleRepository, db: Session):
        self.repo = repo
        self.db = db

    def _has_active_sources(self, dataset_type: str) -> bool:
        return self.db.query(DataSource.id).filter(
            DataSource.dataset_type == dataset_type
        ).first() is not None

    def _create_pending_runs_for_type(self, dataset_type: str) -> None:
        sources = (
            self.db.query(DataSource)
            .filter(DataSource.dataset_type == dataset_type, DataSource.status == "mapped")
            .all()
        )
        for ds in sources:
            existing = (
                self.db.query(PipelineRun)
                .filter(PipelineRun.data_source_id == ds.id, PipelineRun.status == "pending")
                .first()
            )
            if not existing:
                self.db.add(PipelineRun(data_source_id=ds.id, status="pending"))

    def list_rules(self, dataset_type: str | None = None) -> list[LabelRule]:
        return self.repo.list_all(dataset_type)

    def create_rule(self, data: dict) -> LabelRule:
        rule = LabelRule(**data)
        return self.repo.create(rule)

    def delete_rule(self, rule_id: int) -> None:
        rule = self.repo.get(rule_id)
        if not rule:
            raise NotFoundError("Label rule not found")
        self.repo.delete(rule)

    def get_summary(self) -> list[DatasetLabelSummary]:
        all_types = list_dataset_types()
        active_types = {
            row[0] for row in
            self.db.query(DataSource.dataset_type).distinct().all()
        }
        rule_counts = self.repo.count_by_type()
        col_counts = self.repo.column_count_by_type()

        result = []
        for dt in all_types:
            type_id = dt.id.value
            if type_id not in active_types:
                continue
            string_cols = _get_string_columns(type_id)
            col_names = [c["name"] for c in string_cols]

            try:
                bq_stats = get_column_stats(type_id, col_names) if col_names else {}
            except Exception:
                bq_stats = {}
            columns_with_data = sum(
                1 for name in col_names
                if bq_stats.get(name, {}).get("distinct_count", 0) > 0
            )

            result.append(
                DatasetLabelSummary(
                    dataset_type=type_id,
                    dataset_type_name=dt.name,
                    total_rules=rule_counts.get(type_id, 0),
                    columns_with_rules=col_counts.get(type_id, 0),
                    total_string_columns=columns_with_data,
                )
            )
        return result

    def get_column_stats(self, dataset_type: str) -> ColumnStatsResponse:
        dt = get_dataset_type(dataset_type)
        if not dt:
            raise NotFoundError("Dataset type not found")
        if not self._has_active_sources(dataset_type):
            raise NotFoundError("No active data sources for this dataset type")

        string_cols = _get_string_columns(dataset_type)
        if not string_cols:
            return ColumnStatsResponse(
                dataset_type=dataset_type, dataset_type_name=dt.name, columns=[]
            )

        col_names = [c["name"] for c in string_cols]
        try:
            total_rows = get_total_row_count(dataset_type)
            bq_stats = get_column_stats(dataset_type, col_names)
        except Exception:
            logger.warning("BQ unavailable for type %s", dataset_type, exc_info=True)
            total_rows = None
            bq_stats = {}

        rule_counts = self.repo.rule_counts_by_column(dataset_type)
        ai_rule_counts = self.repo.ai_rule_counts_by_column(dataset_type)

        columns = []
        for col in string_cols:
            name = col["name"]
            bq = bq_stats.get(name, {})
            columns.append(
                ColumnStats(
                    column_name=name,
                    description=col["description"],
                    distinct_count=bq.get("distinct_count"),
                    rule_count=rule_counts.get(name, 0),
                    ai_rule_count=ai_rule_counts.get(name, 0),
                    non_null_count=bq.get("non_null_count"),
                    total_rows=total_rows,
                )
            )

        def coverage_key(c: ColumnStats) -> float:
            if c.distinct_count is None or c.distinct_count == 0:
                return 0.0
            return min(c.rule_count, c.distinct_count) / c.distinct_count

        columns.sort(key=coverage_key)

        return ColumnStatsResponse(
            dataset_type=dataset_type,
            dataset_type_name=dt.name,
            total_rows=total_rows,
            columns=columns,
        )

    def get_column_values(
        self, dataset_type: str, column_name: str, search: str | None = None, limit: int = 1000
    ) -> ColumnValuesResponse:
        dt = get_dataset_type(dataset_type)
        if not dt:
            raise NotFoundError("Dataset type not found")
        if not self._has_active_sources(dataset_type):
            raise NotFoundError("No active data sources for this dataset type")

        string_cols = _get_string_columns(dataset_type)
        col_meta = next((c for c in string_cols if c["name"] == column_name), None)
        if not col_meta:
            raise NotFoundError(f"String column '{column_name}' not found in dataset type")

        rules = self.repo.list_by_column(dataset_type, column_name)
        rules_by_lower = {r.match_value.lower().strip(): r for r in rules}

        try:
            total_rows = get_total_row_count(dataset_type) or 0
            bq_values = get_column_value_frequencies(dataset_type, column_name, search=search, limit=limit)
        except Exception:
            logger.warning("BQ unavailable for column values", exc_info=True)
            total_rows = 0
            bq_values = None

        values: list[DistinctValue] = []
        covered_row_count = 0
        seen_rule_keys: set[str] = set()

        if bq_values is not None:
            for v in bq_values:
                val = v["value"]
                count = v["count"]
                pct = (count / total_rows * 100) if total_rows > 0 else 0.0
                rule = rules_by_lower.get(val.lower().strip())
                replacement = rule.replace_value if rule else None
                if rule:
                    seen_rule_keys.add(rule.match_value.lower().strip())
                    covered_row_count += count
                values.append(
                    DistinctValue(
                        value=val,
                        row_count=count,
                        percentage=round(pct, 2),
                        replacement=replacement,
                        ai_suggested=rule.ai_suggested if rule else None,
                        confidence=rule.confidence if rule else None,
                    )
                )

        stale_rules = [
            LabelRuleResponse.model_validate(r)
            for r in rules
            if r.match_value.lower().strip() not in seen_rule_keys
        ]

        return ColumnValuesResponse(
            dataset_type=dataset_type,
            column_name=column_name,
            column_description=col_meta["description"],
            total_rows=total_rows if bq_values is not None else None,
            distinct_count=len(values),
            rule_count=len(rules),
            covered_row_count=covered_row_count,
            values=values,
            stale_rules=stale_rules,
        )

    def bulk_save_rules(self, dataset_type: str, column_name: str, rules: list[dict]) -> int:
        dt = get_dataset_type(dataset_type)
        if not dt:
            raise NotFoundError("Dataset type not found")

        string_cols = _get_string_columns(dataset_type)
        if not any(c["name"] == column_name for c in string_cols):
            raise NotFoundError(f"String column '{column_name}' not found in dataset type")

        self.repo.delete_by_column(dataset_type, column_name)
        created = []
        for item in rules:
            rule = LabelRule(
                dataset_type=dataset_type,
                column_name=column_name,
                match_value=item["match_value"],
                replace_value=item["replace_value"],
            )
            self.repo.create(rule)
            created.append(rule)

        self._create_pending_runs_for_type(dataset_type)
        return len(created)

    def _auto_label_column(
        self, dataset_type: str, dataset_type_def, column_name: str, column_description: str
    ) -> AutoLabelColumnResult:
        try:
            existing_rules = self.repo.list_by_column(dataset_type, column_name)
            mapped_lower = {r.match_value.lower().strip() for r in existing_rules}
            canonical_values = sorted({r.replace_value for r in existing_rules if not r.ai_suggested})

            bq_values = get_column_value_frequencies(dataset_type_def.id.value, column_name, limit=1000)
            if bq_values is None:
                return AutoLabelColumnResult(
                    column_name=column_name, suggestion_count=0, skipped_count=0,
                    error="No data available",
                )

            unmapped = [v for v in bq_values if v["value"].lower().strip() not in mapped_lower]
            skipped_count = len(bq_values) - len(unmapped)

            if not unmapped:
                return AutoLabelColumnResult(
                    column_name=column_name, suggestion_count=0, skipped_count=skipped_count,
                )

            values_text = "\n".join(f'{v["value"]} ({v["count"]} rows)' for v in unmapped)
            canonical_text = ", ".join(canonical_values) if canonical_values else "(none yet)"
            user_message = (
                f"Column: {column_name}\n"
                f"Description: {column_description}\n"
                f"Dataset: {dataset_type_def.name} — {dataset_type_def.description}\n\n"
                f"Existing canonical values (user-approved): {canonical_text}\n\n"
                f"Unmapped values to standardize:\n{values_text}"
            )

            result = chat_json(AUTOLABEL_SYSTEM, user_message)
            if not isinstance(result, list):
                return AutoLabelColumnResult(
                    column_name=column_name, suggestion_count=0, skipped_count=skipped_count,
                    error="AI returned invalid response",
                )

            suggestion_count = 0
            for item in result:
                try:
                    value = str(item["value"])
                    replacement = str(item["replacement"])
                    confidence = max(0.0, min(1.0, float(item["confidence"])))
                except (KeyError, TypeError, ValueError):
                    continue

                rule = LabelRule(
                    dataset_type=dataset_type,
                    column_name=column_name,
                    match_value=value,
                    replace_value=replacement,
                    ai_suggested=True,
                    confidence=confidence,
                )
                self.db.add(rule)
                suggestion_count += 1

            self.db.flush()
            return AutoLabelColumnResult(
                column_name=column_name, suggestion_count=suggestion_count, skipped_count=skipped_count,
            )

        except Exception as e:
            logger.error("Auto-label error for column %s: %s", column_name, e, exc_info=True)
            return AutoLabelColumnResult(
                column_name=column_name, suggestion_count=0, skipped_count=0,
                error=str(e),
            )

    def auto_label_column(self, dataset_type: str, column_name: str) -> AutoLabelResponse:
        if not settings.anthropic_api_key:
            raise ServiceUnavailableError("AI service not configured")

        dt = get_dataset_type(dataset_type)
        if not dt:
            raise NotFoundError("Dataset type not found")

        string_cols = _get_string_columns(dataset_type)
        col_meta = next((c for c in string_cols if c["name"] == column_name), None)
        if not col_meta:
            raise NotFoundError(f"String column '{column_name}' not found in dataset type")

        from izakaya_api.core.exceptions import ExternalServiceError
        col_result = self._auto_label_column(dataset_type, dt, column_name, col_meta["description"])

        if col_result.error:
            raise ExternalServiceError(col_result.error)

        suggestions = [
            AutoLabelSuggestion(
                match_value=r.match_value, replace_value=r.replace_value, confidence=r.confidence,
            )
            for r in self.repo.get_recent_ai_suggestions(dataset_type, column_name, col_result.suggestion_count)
        ]

        return AutoLabelResponse(suggestions=suggestions, skipped_count=col_result.skipped_count)

    def undo_auto_label_column(self, dataset_type: str, column_name: str) -> int:
        return self.repo.delete_ai_by_column(dataset_type, column_name)

    def auto_label_all(self, dataset_type: str) -> AutoLabelAllResponse:
        if not settings.anthropic_api_key:
            raise ServiceUnavailableError("AI service not configured")

        dt = get_dataset_type(dataset_type)
        if not dt:
            raise NotFoundError("Dataset type not found")

        string_cols = _get_string_columns(dataset_type)
        if not string_cols:
            return AutoLabelAllResponse(columns=[], total_suggestions=0, total_skipped=0)

        columns: list[AutoLabelColumnResult] = []
        for col in string_cols:
            result = self._auto_label_column(dataset_type, dt, col["name"], col["description"])
            columns.append(result)

        return AutoLabelAllResponse(
            columns=columns,
            total_suggestions=sum(c.suggestion_count for c in columns),
            total_skipped=sum(c.skipped_count for c in columns),
        )

    def undo_auto_label_all(self, dataset_type: str) -> int:
        return self.repo.delete_ai_by_type(dataset_type)
