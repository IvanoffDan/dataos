from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from izakaya_api.core.dependencies import get_current_user, get_db
from izakaya_api.core.exceptions import NotFoundError
from izakaya_api.domains.auth.models import User
from izakaya_api.domains.connectors.repository import ConnectorRepository
from izakaya_api.domains.data_sources.repository import (
    DataSourceRepository,
    MappingRepository,
    PipelineRunRepository,
)
from izakaya_api.domains.data_sources.schemas import (
    AcceptMappingsRequest,
    AutoMapResponse,
    DataSourceCreate,
    DataSourceResponse,
    DataSourceUpdate,
    MappingBulkSave,
    MappingPatch,
    MappingResponse,
    PipelineRunResponse,
    ReviewContextResponse,
    ValidationErrorResponse,
)
from izakaya_api.domains.data_sources.service import DataSourceService
from izakaya_api.domains.labels.repository import LabelRuleRepository
from izakaya_api.domains.labels.service import LabelService

router = APIRouter(tags=["data-sources"])


def _get_service(db: Session = Depends(get_db)) -> DataSourceService:
    return DataSourceService(
        ds_repo=DataSourceRepository(db),
        mapping_repo=MappingRepository(db),
        run_repo=PipelineRunRepository(db),
        connector_repo=ConnectorRepository(db),
    )


# --- Data source CRUD ---

@router.get("/data-sources", response_model=list[DataSourceResponse])
def list_data_sources(
    _user: User = Depends(get_current_user),
    svc: DataSourceService = Depends(_get_service),
):
    return svc.list_all()


@router.post("/data-sources", response_model=DataSourceResponse, status_code=201)
def create_data_source(
    body: DataSourceCreate,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    svc: DataSourceService = Depends(_get_service),
):
    result = svc.create(body.name, body.description, body.dataset_type, body.connector_id, body.bq_table)
    db.commit()
    return result


@router.get("/data-sources/{data_source_id}", response_model=DataSourceResponse)
def get_data_source(
    data_source_id: int,
    _user: User = Depends(get_current_user),
    svc: DataSourceService = Depends(_get_service),
):
    return svc.get(data_source_id)


@router.patch("/data-sources/{data_source_id}", response_model=DataSourceResponse)
def update_data_source(
    data_source_id: int,
    body: DataSourceUpdate,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    svc: DataSourceService = Depends(_get_service),
):
    result = svc.update(data_source_id, body.model_dump(exclude_unset=True))
    db.commit()
    return result


@router.delete("/data-sources/{data_source_id}", status_code=204)
def delete_data_source(
    data_source_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    svc: DataSourceService = Depends(_get_service),
):
    svc.delete(data_source_id)
    db.commit()


# --- Approve ---

@router.post("/data-sources/{data_source_id}/approve", response_model=DataSourceResponse)
def approve_data_source(
    data_source_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    svc: DataSourceService = Depends(_get_service),
):
    result = svc.approve(data_source_id)
    db.commit()
    return result


# --- Accept Mappings ---

@router.post("/data-sources/{data_source_id}/accept-mappings", response_model=DataSourceResponse)
def accept_mappings(
    data_source_id: int,
    body: AcceptMappingsRequest,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    svc: DataSourceService = Depends(_get_service),
):
    result = svc.accept_mappings(data_source_id, reprocess=body.reprocess)
    db.commit()
    return result


@router.post("/data-sources/{data_source_id}/reset-mappings", response_model=DataSourceResponse)
def reset_mappings_accepted(
    data_source_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    svc: DataSourceService = Depends(_get_service),
):
    result = svc.reset_mappings_accepted(data_source_id)
    db.commit()
    return result


# --- Retry ---

@router.post("/data-sources/{data_source_id}/retry", response_model=DataSourceResponse)
def retry_data_source(
    data_source_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    svc: DataSourceService = Depends(_get_service),
):
    result = svc.retry(data_source_id)
    db.commit()
    return result


# --- Pipeline runs ---

@router.post("/data-sources/{data_source_id}/run", response_model=PipelineRunResponse, status_code=201)
def trigger_pipeline_run(
    data_source_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    svc: DataSourceService = Depends(_get_service),
):
    run = svc.trigger_run(data_source_id)
    db.commit()
    db.refresh(run)
    return run


@router.get("/data-sources/{data_source_id}/runs", response_model=list[PipelineRunResponse])
def list_pipeline_runs(
    data_source_id: int,
    _user: User = Depends(get_current_user),
    svc: DataSourceService = Depends(_get_service),
):
    return svc.list_runs(data_source_id)


@router.get("/pipeline/runs/{run_id}/errors", response_model=list[ValidationErrorResponse])
def get_run_errors(
    run_id: int,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    _user: User = Depends(get_current_user),
    svc: DataSourceService = Depends(_get_service),
):
    if not svc.run_repo.get(run_id):
        raise NotFoundError("Pipeline run not found")
    return svc.run_repo.get_validation_errors(run_id, offset, limit)


# --- Mappings ---

@router.get("/data-sources/{data_source_id}/source-columns")
def get_source_columns(
    data_source_id: int,
    _user: User = Depends(get_current_user),
    svc: DataSourceService = Depends(_get_service),
):
    return svc.get_source_columns(data_source_id)


@router.put("/data-sources/{data_source_id}/mappings", response_model=list[MappingResponse])
def save_mappings(
    data_source_id: int,
    body: MappingBulkSave,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    svc: DataSourceService = Depends(_get_service),
):
    mappings = svc.save_mappings(data_source_id, [m.model_dump() for m in body.mappings])
    db.commit()
    for m in mappings:
        db.refresh(m)
    return mappings


@router.get("/data-sources/{data_source_id}/mappings", response_model=list[MappingResponse])
def get_mappings(
    data_source_id: int,
    _user: User = Depends(get_current_user),
    svc: DataSourceService = Depends(_get_service),
):
    return svc.get_mappings(data_source_id)


# --- Review Context ---

@router.get("/data-sources/{data_source_id}/review-context", response_model=ReviewContextResponse)
def get_review_context(
    data_source_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    svc: DataSourceService = Depends(_get_service),
):
    label_svc = LabelService(repo=LabelRuleRepository(db), db=db)
    return svc.get_review_context(data_source_id, label_service=label_svc)


# --- Patch Mapping ---

@router.patch("/data-sources/{data_source_id}/mappings/{target_column}", response_model=MappingResponse)
def patch_mapping(
    data_source_id: int,
    target_column: str,
    body: MappingPatch,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    svc: DataSourceService = Depends(_get_service),
):
    label_repo = LabelRuleRepository(db)
    mapping = svc.patch_mapping(
        data_source_id, target_column, body.model_dump(exclude_unset=True), label_repo=label_repo
    )
    db.commit()
    db.refresh(mapping)
    return mapping


# --- Reprocess (re-run pipeline + auto-label) ---

@router.post("/data-sources/{data_source_id}/reprocess", response_model=DataSourceResponse)
def reprocess_data_source(
    data_source_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    svc: DataSourceService = Depends(_get_service),
):
    result = svc.reprocess(data_source_id)
    db.commit()
    return result


# --- Auto-map ---

@router.post("/data-sources/{data_source_id}/auto-map", response_model=AutoMapResponse)
def auto_map(
    data_source_id: int,
    _user: User = Depends(get_current_user),
    svc: DataSourceService = Depends(_get_service),
):
    return svc.auto_map(data_source_id)
