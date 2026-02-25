from sqlalchemy import func
from sqlalchemy.orm import Session

from izakaya_api.domains.labels.models import LabelRule


class LabelRuleRepository:
    def __init__(self, db: Session):
        self.db = db

    def list_all(self, dataset_type: str | None = None) -> list[LabelRule]:
        query = self.db.query(LabelRule)
        if dataset_type is not None:
            query = query.filter(LabelRule.dataset_type == dataset_type)
        return query.order_by(LabelRule.created_at.desc()).all()

    def get(self, rule_id: int) -> LabelRule | None:
        return self.db.get(LabelRule, rule_id)

    def create(self, rule: LabelRule) -> LabelRule:
        self.db.add(rule)
        self.db.flush()
        return rule

    def delete(self, rule: LabelRule) -> None:
        self.db.delete(rule)
        self.db.flush()

    def list_by_column(self, dataset_type: str, column_name: str) -> list[LabelRule]:
        return (
            self.db.query(LabelRule)
            .filter(LabelRule.dataset_type == dataset_type, LabelRule.column_name == column_name)
            .all()
        )

    def delete_by_column(self, dataset_type: str, column_name: str) -> int:
        return (
            self.db.query(LabelRule)
            .filter(LabelRule.dataset_type == dataset_type, LabelRule.column_name == column_name)
            .delete()
        )

    def delete_ai_by_column(self, dataset_type: str, column_name: str) -> int:
        return (
            self.db.query(LabelRule)
            .filter(
                LabelRule.dataset_type == dataset_type,
                LabelRule.column_name == column_name,
                LabelRule.ai_suggested == True,  # noqa: E712
            )
            .delete()
        )

    def delete_ai_by_type(self, dataset_type: str) -> int:
        return (
            self.db.query(LabelRule)
            .filter(
                LabelRule.dataset_type == dataset_type,
                LabelRule.ai_suggested == True,  # noqa: E712
            )
            .delete()
        )

    def count_by_type(self) -> dict[str, int]:
        rows = (
            self.db.query(LabelRule.dataset_type, func.count(LabelRule.id))
            .group_by(LabelRule.dataset_type)
            .all()
        )
        return dict(rows)

    def column_count_by_type(self) -> dict[str, int]:
        rows = (
            self.db.query(LabelRule.dataset_type, func.count(func.distinct(LabelRule.column_name)))
            .group_by(LabelRule.dataset_type)
            .all()
        )
        return dict(rows)

    def rule_counts_by_column(self, dataset_type: str) -> dict[str, int]:
        rows = (
            self.db.query(LabelRule.column_name, func.count(LabelRule.id))
            .filter(LabelRule.dataset_type == dataset_type)
            .group_by(LabelRule.column_name)
            .all()
        )
        return dict(rows)

    def ai_rule_counts_by_column(self, dataset_type: str) -> dict[str, int]:
        rows = (
            self.db.query(LabelRule.column_name, func.count(LabelRule.id))
            .filter(LabelRule.dataset_type == dataset_type, LabelRule.ai_suggested == True)  # noqa: E712
            .group_by(LabelRule.column_name)
            .all()
        )
        return dict(rows)

    def get_recent_ai_suggestions(self, dataset_type: str, column_name: str, limit: int) -> list[LabelRule]:
        return (
            self.db.query(LabelRule)
            .filter(
                LabelRule.dataset_type == dataset_type,
                LabelRule.column_name == column_name,
                LabelRule.ai_suggested == True,  # noqa: E712
            )
            .order_by(LabelRule.id.desc())
            .limit(limit)
            .all()
        )
