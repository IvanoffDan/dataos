import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from izakaya_api.dataset_types import get_dataset_type
from izakaya_api.deps import get_current_user, get_db
from izakaya_api.models.connector import Connector
from izakaya_api.models.data_source import DataSource
from izakaya_api.models.mapping import Mapping
from izakaya_api.models.pipeline_run import PipelineRun
from izakaya_api.models.user import User
from izakaya_api.schemas.data_source import DataSourceCreate, DataSourceResponse, DataSourceUpdate
from izakaya_api.schemas.mapping import AutoMapResponse, AutoMapSuggestion, MappingBulkSave, MappingResponse
from izakaya_api.schemas.pipeline_run import PipelineRunResponse
from izakaya_api.services.bigquery import get_sample_values, get_table_columns

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/data-sources", tags=["data-sources"])


def _maybe_create_pending_run(db: Session, data_source_id: int) -> None:
    existing = (
        db.query(PipelineRun)
        .filter(PipelineRun.data_source_id == data_source_id, PipelineRun.status == "pending")
        .first()
    )
    if not existing:
        run = PipelineRun(data_source_id=data_source_id, status="pending")
        db.add(run)


def _build_response(ds: DataSource, connector: Connector | None) -> DataSourceResponse:
    return DataSourceResponse(
        id=ds.id,
        name=ds.name,
        description=ds.description,
        dataset_type=ds.dataset_type,
        connector_id=ds.connector_id,
        bq_table=ds.bq_table,
        status=ds.status,
        created_at=ds.created_at,
        updated_at=ds.updated_at,
        connector_name=connector.name if connector else "",
    )


# --- CRUD ---


@router.get("", response_model=list[DataSourceResponse])
def list_data_sources(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    sources = db.query(DataSource).order_by(DataSource.created_at.desc()).all()
    connector_ids = {s.connector_id for s in sources}
    connectors = {c.id: c for c in db.query(Connector).filter(Connector.id.in_(connector_ids)).all()} if connector_ids else {}
    return [_build_response(s, connectors.get(s.connector_id)) for s in sources]


@router.post("", response_model=DataSourceResponse, status_code=201)
def create_data_source(
    body: DataSourceCreate,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    if not get_dataset_type(body.dataset_type):
        raise HTTPException(status_code=400, detail=f"Unknown dataset type: {body.dataset_type}")
    connector = db.get(Connector, body.connector_id)
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    ds = DataSource(
        name=body.name,
        description=body.description,
        dataset_type=body.dataset_type,
        connector_id=body.connector_id,
        bq_table=body.bq_table,
        status="pending_mapping",
    )
    db.add(ds)
    db.commit()
    db.refresh(ds)
    return _build_response(ds, connector)


@router.get("/{data_source_id}", response_model=DataSourceResponse)
def get_data_source(
    data_source_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    ds = db.get(DataSource, data_source_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Data source not found")
    connector = db.get(Connector, ds.connector_id)
    return _build_response(ds, connector)


@router.patch("/{data_source_id}", response_model=DataSourceResponse)
def update_data_source(
    data_source_id: int,
    body: DataSourceUpdate,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    ds = db.get(DataSource, data_source_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Data source not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(ds, key, value)
    db.commit()
    db.refresh(ds)
    connector = db.get(Connector, ds.connector_id)
    return _build_response(ds, connector)


@router.delete("/{data_source_id}", status_code=204)
def delete_data_source(
    data_source_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    ds = db.get(DataSource, data_source_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Data source not found")
    db.delete(ds)
    db.commit()


# --- Pipeline runs ---


@router.post("/{data_source_id}/run", response_model=PipelineRunResponse, status_code=201)
def trigger_pipeline_run(
    data_source_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    ds = db.get(DataSource, data_source_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Data source not found")
    run = PipelineRun(data_source_id=data_source_id, status="pending")
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


@router.get("/{data_source_id}/runs", response_model=list[PipelineRunResponse])
def list_pipeline_runs(
    data_source_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    ds = db.get(DataSource, data_source_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Data source not found")
    return (
        db.query(PipelineRun)
        .filter(PipelineRun.data_source_id == data_source_id)
        .order_by(PipelineRun.created_at.desc())
        .all()
    )


# --- Column mappings ---


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
    db.query(Mapping).filter(Mapping.data_source_id == data_source_id).delete()
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
    ds.status = "mapped" if body.mappings else "pending_mapping"
    _maybe_create_pending_run(db, data_source_id)
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


# --- Auto-map ---

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

    ds = db.get(DataSource, data_source_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Data source not found")

    dt = get_dataset_type(ds.dataset_type)
    if not dt:
        raise HTTPException(status_code=400, detail=f"Unknown dataset type: {ds.dataset_type}")

    connector = db.get(Connector, ds.connector_id)
    if not connector or not connector.schema_name:
        raise HTTPException(status_code=400, detail="Connector has no BQ schema")

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
        result = chat_json(_AUTOMAP_SYSTEM, user_message)
    except Exception:
        logger.exception("Auto-map AI call failed")
        raise HTTPException(status_code=502, detail="AI service error")

    if not isinstance(result, list):
        raise HTTPException(status_code=502, detail="AI returned invalid response")

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
