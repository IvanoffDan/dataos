from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from izakaya_api.deps import get_current_user, get_db
from izakaya_api.models.connector import Connector
from izakaya_api.models.data_source import DataSource
from izakaya_api.models.mapping import Mapping
from izakaya_api.models.pipeline_run import PipelineRun
from izakaya_api.models.user import User
from izakaya_api.schemas.mapping import MappingBulkSave, MappingResponse
from izakaya_api.services.bigquery import get_table_columns

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
