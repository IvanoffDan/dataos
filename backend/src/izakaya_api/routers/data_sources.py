import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from izakaya_api.dataset_types import get_dataset_type
from izakaya_api.deps import get_current_user, get_db
from izakaya_api.models.connector import Connector
from izakaya_api.models.data_source import DataSource
from izakaya_api.models.dataset import Dataset
from izakaya_api.models.mapping import Mapping
from izakaya_api.models.pipeline_run import PipelineRun
from izakaya_api.models.user import User
from izakaya_api.schemas.mapping import AutoMapResponse, AutoMapSuggestion, MappingBulkSave, MappingResponse
from izakaya_api.services.bigquery import get_sample_values, get_table_columns

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/data-sources", tags=["data-sources"])


def _maybe_create_pending_run(db: Session, dataset_id: int) -> None:
    existing = (
        db.query(PipelineRun)
        .filter(PipelineRun.dataset_id == dataset_id, PipelineRun.status == "pending")
        .first()
    )
    if not existing:
        run = PipelineRun(dataset_id=dataset_id, status="pending")
        db.add(run)


@router.delete("/{data_source_id}", status_code=204)
def delete_data_source(
    data_source_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    ds = db.get(DataSource, data_source_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Data source not found")
    dataset_id = ds.dataset_id
    db.delete(ds)
    _maybe_create_pending_run(db, dataset_id)
    db.commit()


@router.get("/{data_source_id}/source-columns")
def get_source_columns(
    data_source_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    ds = db.get(DataSource, data_source_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Data source not found")
    connector = db.get(Connector, ds.connector_id)
    if not connector or not connector.schema_name:
        raise HTTPException(status_code=400, detail="Connector has no BQ schema")
    return get_table_columns(connector.schema_name, ds.bq_table)


@router.put("/{data_source_id}/mappings", response_model=list[MappingResponse])
def save_mappings(
    data_source_id: int,
    body: MappingBulkSave,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    ds = db.get(DataSource, data_source_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Data source not found")
    # Delete existing mappings
    db.query(Mapping).filter(Mapping.data_source_id == data_source_id).delete()
    # Create new mappings
    new_mappings = []
    for item in body.mappings:
        m = Mapping(
            data_source_id=data_source_id,
            source_column=item.source_column or None,
            target_column=item.target_column,
            static_value=item.static_value,
        )
        db.add(m)
        new_mappings.append(m)
    # Update data source status
    ds.status = "mapped" if body.mappings else "pending_mapping"
    _maybe_create_pending_run(db, ds.dataset_id)
    db.commit()
    for m in new_mappings:
        db.refresh(m)
    return new_mappings


@router.get("/{data_source_id}/mappings", response_model=list[MappingResponse])
def get_mappings(
    data_source_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    ds = db.get(DataSource, data_source_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Data source not found")
    return (
        db.query(Mapping)
        .filter(Mapping.data_source_id == data_source_id)
        .order_by(Mapping.created_at)
        .all()
    )


_AUTOMAP_SYSTEM = """\
You are a data column mapping assistant. You match source data columns to a target \
schema by analyzing column names, data types, and sample values.

You will be given:
1. Target columns with their name, description, data type, required flag, and constraints
2. Source columns with their name, BQ type, sample values, and whether already used

For each unmapped target column, suggest the best source column match or a static value.

Rules:
- Match semantically using column names, data types, and sample values
- Allow reasonable type coercions (TIMESTAMP→DATE, INTEGER→FLOAT, STRING→DATE if format matches)
- Suggest a static_value only when the data strongly implies a constant (e.g. all rows from one channel)
- Never reuse a source column marked as "already used"
- Prefer source columns not yet suggested for other targets (avoid duplicates)
- If no good match exists, return source_column and static_value both as null
- Confidence >= 0.9: clear match, obvious mapping
- Confidence 0.7–0.89: likely correct but some ambiguity
- Confidence < 0.7: uncertain, needs human review
- Include brief reasoning for each suggestion

Respond with a JSON array only:
[{"target_column": "name", "source_column": "src_col_or_null", "static_value": "val_or_null", \
"confidence": 0.95, "reasoning": "brief explanation"}, ...]
"""


@router.post("/{data_source_id}/auto-map", response_model=AutoMapResponse)
def auto_map(
    data_source_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    from izakaya_api.services.ai import chat_json

    # Load data source + related objects
    ds = db.get(DataSource, data_source_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Data source not found")

    dataset = db.get(Dataset, ds.dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    dt = get_dataset_type(dataset.type)
    if not dt:
        raise HTTPException(status_code=400, detail=f"Unknown dataset type: {dataset.type}")

    connector = db.get(Connector, ds.connector_id)
    if not connector or not connector.schema_name:
        raise HTTPException(status_code=400, detail="Connector has no BQ schema")

    # Load existing mappings to identify already-mapped targets and used source columns
    existing_mappings = (
        db.query(Mapping)
        .filter(Mapping.data_source_id == data_source_id)
        .all()
    )
    mapped_targets = {m.target_column for m in existing_mappings if m.source_column or m.static_value}
    used_sources = {m.source_column for m in existing_mappings if m.source_column}

    unmapped_cols = [c for c in dt.columns if c.name not in mapped_targets]
    if not unmapped_cols:
        return AutoMapResponse(suggestions=[], skipped_count=len(dt.columns))

    # Get source columns and sample values
    source_cols = get_table_columns(connector.schema_name, ds.bq_table)
    source_col_names = [c["name"] for c in source_cols]
    samples = get_sample_values(connector.schema_name, ds.bq_table, source_col_names)

    # Build prompt
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
        result = chat_json(_AUTOMAP_SYSTEM, user_message)
    except Exception:
        logger.exception("Auto-map AI call failed")
        raise HTTPException(status_code=502, detail="AI service error")

    if not isinstance(result, list):
        raise HTTPException(status_code=502, detail="AI returned invalid response")

    suggestions = []
    for item in result:
        try:
            target = str(item["target_column"])
            source = item.get("source_column")
            static = item.get("static_value")
            confidence = max(0.0, min(1.0, float(item.get("confidence", 0))))
            reasoning = str(item.get("reasoning", ""))
        except (KeyError, TypeError, ValueError):
            continue

        # Only include suggestions for unmapped target columns
        unmapped_names = {c.name for c in unmapped_cols}
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
