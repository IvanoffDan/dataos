import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from izakaya_api.dataset_types import get_dataset_type, list_dataset_types
from izakaya_api.dataset_types.base import DataType
from izakaya_api.deps import get_current_user, get_db
from izakaya_api.models.dataset import Dataset
from izakaya_api.models.label_rule import LabelRule
from izakaya_api.models.user import User
from izakaya_api.schemas.label_rule import (
    AutoLabelResponse,
    AutoLabelSuggestion,
    ColumnStats,
    ColumnStatsResponse,
    ColumnValuesResponse,
    DatasetLabelSummary,
    DistinctValue,
    LabelRuleBulkSave,
    LabelRuleCreate,
    LabelRuleResponse,
)
from izakaya_api.services.bigquery import (
    get_column_stats,
    get_column_value_frequencies,
    get_total_row_count,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/labels", tags=["labels"])


# --- Existing CRUD endpoints ---


@router.get("/", response_model=list[LabelRuleResponse])
def list_label_rules(
    dataset_id: int | None = None,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    query = db.query(LabelRule)
    if dataset_id is not None:
        query = query.filter(LabelRule.dataset_id == dataset_id)
    return query.order_by(LabelRule.created_at.desc()).all()


@router.post("/", response_model=LabelRuleResponse, status_code=201)
def create_label_rule(
    body: LabelRuleCreate,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    rule = LabelRule(**body.model_dump())
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/{rule_id}", status_code=204)
def delete_label_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    rule = db.get(LabelRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Label rule not found")
    db.delete(rule)
    db.commit()


# --- New endpoints ---


def _get_string_columns(dataset_type_id: str) -> list[dict]:
    """Return list of {name, description} for string columns in a dataset type."""
    dt = get_dataset_type(dataset_type_id)
    if not dt:
        return []
    return [
        {"name": c.name, "description": c.description}
        for c in dt.columns
        if c.data_type == DataType.STRING
    ]


@router.get("/summary", response_model=list[DatasetLabelSummary])
def label_summary(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Dashboard: per-dataset rule counts and column coverage."""
    datasets = db.query(Dataset).order_by(Dataset.name).all()

    # Rule counts per dataset: {dataset_id: total_rules}
    rule_counts = dict(
        db.query(LabelRule.dataset_id, func.count(LabelRule.id))
        .group_by(LabelRule.dataset_id)
        .all()
    )

    # Distinct columns with rules per dataset
    col_counts = dict(
        db.query(LabelRule.dataset_id, func.count(func.distinct(LabelRule.column_name)))
        .group_by(LabelRule.dataset_id)
        .all()
    )

    result = []
    for ds in datasets:
        string_cols = _get_string_columns(ds.type)
        result.append(
            DatasetLabelSummary(
                dataset_id=ds.id,
                dataset_name=ds.name,
                dataset_type=ds.type,
                total_rules=rule_counts.get(ds.id, 0),
                columns_with_rules=col_counts.get(ds.id, 0),
                total_string_columns=len(string_cols),
            )
        )
    return result


@router.get("/datasets/{dataset_id}/columns", response_model=ColumnStatsResponse)
def dataset_column_stats(
    dataset_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Column overview: per-column stats (distinct count, rule count, coverage)."""
    dataset = db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    string_cols = _get_string_columns(dataset.type)
    if not string_cols:
        return ColumnStatsResponse(
            dataset_id=dataset.id,
            dataset_name=dataset.name,
            dataset_type=dataset.type,
            columns=[],
        )

    col_names = [c["name"] for c in string_cols]

    # BQ stats (graceful failure)
    try:
        total_rows = get_total_row_count(dataset.type)
        bq_stats = get_column_stats(dataset.type, col_names)
    except Exception:
        logger.warning("BQ unavailable for dataset %s", dataset.type, exc_info=True)
        total_rows = None
        bq_stats = {}

    # Rule counts per column from Postgres
    rule_counts = dict(
        db.query(LabelRule.column_name, func.count(LabelRule.id))
        .filter(LabelRule.dataset_id == dataset_id)
        .group_by(LabelRule.column_name)
        .all()
    )

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
                non_null_count=bq.get("non_null_count"),
                total_rows=total_rows,
            )
        )

    # Sort by coverage ascending (least covered first)
    def coverage_key(c: ColumnStats) -> float:
        if c.distinct_count is None or c.distinct_count == 0:
            return 0.0
        return c.rule_count / c.distinct_count

    columns.sort(key=coverage_key)

    return ColumnStatsResponse(
        dataset_id=dataset.id,
        dataset_name=dataset.name,
        dataset_type=dataset.type,
        total_rows=total_rows,
        columns=columns,
    )


@router.get("/datasets/{dataset_id}/columns/{column_name}/values", response_model=ColumnValuesResponse)
def column_values(
    dataset_id: int,
    column_name: str,
    search: str | None = None,
    limit: int = 1000,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Distinct values for a column merged with existing rules."""
    dataset = db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Validate column exists in dataset type
    string_cols = _get_string_columns(dataset.type)
    col_meta = next((c for c in string_cols if c["name"] == column_name), None)
    if not col_meta:
        raise HTTPException(status_code=404, detail=f"String column '{column_name}' not found in dataset type")

    # Load existing rules for this column
    rules = (
        db.query(LabelRule)
        .filter(LabelRule.dataset_id == dataset_id, LabelRule.column_name == column_name)
        .all()
    )
    rules_by_lower = {r.match_value.lower().strip(): r for r in rules}

    # Get BQ data
    try:
        total_rows = get_total_row_count(dataset.type) or 0
        bq_values = get_column_value_frequencies(dataset.type, column_name, search=search, limit=limit)
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

    # Stale rules: rules whose match_value doesn't appear in current BQ data
    stale_rules = [
        LabelRuleResponse.model_validate(r)
        for r in rules
        if r.match_value.lower().strip() not in seen_rule_keys
    ]

    return ColumnValuesResponse(
        dataset_id=dataset.id,
        column_name=column_name,
        column_description=col_meta["description"],
        total_rows=total_rows if bq_values is not None else None,
        distinct_count=len(values),
        rule_count=len(rules),
        covered_row_count=covered_row_count,
        values=values,
        stale_rules=stale_rules,
    )


@router.put("/datasets/{dataset_id}/columns/{column_name}/rules")
def bulk_save_rules(
    dataset_id: int,
    column_name: str,
    body: LabelRuleBulkSave,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Bulk save: delete old rules for this column, create new ones."""
    dataset = db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Validate column exists
    string_cols = _get_string_columns(dataset.type)
    if not any(c["name"] == column_name for c in string_cols):
        raise HTTPException(status_code=404, detail=f"String column '{column_name}' not found in dataset type")

    # Delete existing rules for this column
    db.query(LabelRule).filter(
        LabelRule.dataset_id == dataset_id,
        LabelRule.column_name == column_name,
    ).delete()

    # Create new rules
    created = []
    for item in body.rules:
        rule = LabelRule(
            dataset_id=dataset_id,
            column_name=column_name,
            match_value=item.match_value,
            replace_value=item.replace_value,
        )
        db.add(rule)
        created.append(rule)

    db.commit()
    return {"saved": len(created)}


# --- Auto-label ---

_AUTOLABEL_SYSTEM = """\
You are a data standardization assistant. You normalize inconsistent string values \
in data columns by suggesting canonical replacement values.

You will be given a column name, its description, and a list of distinct values \
with their row counts. For each value, suggest the best canonical replacement \
and a confidence score (0.0–1.0).

Rules:
- Group values that refer to the same entity (e.g. "sydney", "SYD" → "Sydney")
- Use proper capitalization and standard forms appropriate for the column type
- Values already in canonical form should map to themselves with high confidence
- Confidence >= 0.9: clear match, obvious standardization
- Confidence 0.7–0.89: likely correct but some ambiguity
- Confidence < 0.7: uncertain, needs human review

Respond with a JSON array only:
[{"value": "original", "replacement": "Canonical", "confidence": 0.95}, ...]
"""


@router.post(
    "/datasets/{dataset_id}/columns/{column_name}/auto-label",
    response_model=AutoLabelResponse,
)
def auto_label(
    dataset_id: int,
    column_name: str,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Use AI to suggest label rules for unmapped values."""
    from izakaya_api.config import settings
    from izakaya_api.services.ai import chat_json

    if not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="AI service not configured")

    dataset = db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    dt = get_dataset_type(dataset.type)
    if not dt:
        raise HTTPException(status_code=404, detail="Dataset type not found")

    string_cols = _get_string_columns(dataset.type)
    col_meta = next((c for c in string_cols if c["name"] == column_name), None)
    if not col_meta:
        raise HTTPException(
            status_code=404, detail=f"String column '{column_name}' not found in dataset type"
        )

    # Load existing rules
    existing_rules = (
        db.query(LabelRule)
        .filter(LabelRule.dataset_id == dataset_id, LabelRule.column_name == column_name)
        .all()
    )
    mapped_lower = {r.match_value.lower().strip() for r in existing_rules}
    canonical_values = sorted({r.replace_value for r in existing_rules if not r.ai_suggested})

    # Get BQ values
    try:
        bq_values = get_column_value_frequencies(dataset.type, column_name, limit=1000)
    except Exception:
        raise HTTPException(status_code=400, detail="No data available. Run the pipeline first.")

    if bq_values is None:
        raise HTTPException(status_code=400, detail="No data available. Run the pipeline first.")

    # Filter to unmapped values only
    unmapped = [v for v in bq_values if v["value"].lower().strip() not in mapped_lower]
    skipped_count = len(bq_values) - len(unmapped)

    if not unmapped:
        return AutoLabelResponse(suggestions=[], skipped_count=skipped_count)

    # Build prompt
    values_text = "\n".join(f'{v["value"]} ({v["count"]} rows)' for v in unmapped)
    canonical_text = ", ".join(canonical_values) if canonical_values else "(none yet)"
    user_message = (
        f"Column: {column_name}\n"
        f"Description: {col_meta['description']}\n"
        f"Dataset: {dt.name} — {dt.description}\n\n"
        f"Existing canonical values (user-approved): {canonical_text}\n\n"
        f"Unmapped values to standardize:\n{values_text}"
    )

    # Call AI
    try:
        result = chat_json(_AUTOLABEL_SYSTEM, user_message)
    except Exception as e:
        logger.error("AI service error: %s", e, exc_info=True)
        raise HTTPException(status_code=502, detail=f"AI service unavailable: {e}")

    if not isinstance(result, list):
        raise HTTPException(status_code=502, detail="AI returned invalid response")

    # Save suggestions to DB
    suggestions: list[AutoLabelSuggestion] = []
    for item in result:
        try:
            value = str(item["value"])
            replacement = str(item["replacement"])
            confidence = float(item["confidence"])
        except (KeyError, TypeError, ValueError):
            continue

        confidence = max(0.0, min(1.0, confidence))

        rule = LabelRule(
            dataset_id=dataset_id,
            column_name=column_name,
            match_value=value,
            replace_value=replacement,
            ai_suggested=True,
            confidence=confidence,
        )
        db.add(rule)
        suggestions.append(
            AutoLabelSuggestion(
                match_value=value, replace_value=replacement, confidence=confidence
            )
        )

    db.commit()
    return AutoLabelResponse(suggestions=suggestions, skipped_count=skipped_count)


@router.delete("/datasets/{dataset_id}/columns/{column_name}/auto-label")
def undo_auto_label(
    dataset_id: int,
    column_name: str,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Remove all AI-suggested rules for a column."""
    count = (
        db.query(LabelRule)
        .filter(
            LabelRule.dataset_id == dataset_id,
            LabelRule.column_name == column_name,
            LabelRule.ai_suggested == True,  # noqa: E712
        )
        .delete()
    )
    db.commit()
    return {"deleted": count}
