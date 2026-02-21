from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from izakaya_api.dataset_types import get_dataset_type, list_dataset_types
from izakaya_api.deps import get_current_user, get_db
from izakaya_api.models.connector import Connector
from izakaya_api.models.data_source import DataSource
from izakaya_api.models.dataset import Dataset
from izakaya_api.models.pipeline_run import PipelineRun
from izakaya_api.models.user import User
from izakaya_api.schemas.data_source import DataSourceCreate, DataSourceResponse
from izakaya_api.schemas.dataset import (
    ColumnDefResponse,
    DatasetCreate,
    DatasetResponse,
    DatasetTypeResponse,
    DatasetUpdate,
)
from izakaya_api.schemas.pipeline_run import PipelineRunResponse

router = APIRouter(prefix="/datasets", tags=["datasets"])


# --- Dataset type registry endpoints ---


@router.get("/types", response_model=list[DatasetTypeResponse])
def get_dataset_types(_user: User = Depends(get_current_user)):
    types = list_dataset_types()
    return [
        DatasetTypeResponse(
            id=t.id,
            name=t.name,
            description=t.description,
            grain=t.grain,
            duration=t.duration,
            columns=[
                ColumnDefResponse(
                    name=c.name,
                    description=c.description,
                    data_type=c.data_type.value,
                    required=c.required,
                    max_length=c.max_length,
                    min_value=c.min_value,
                    format=c.format,
                    notes=c.notes,
                )
                for c in t.columns
            ],
        )
        for t in types
    ]


@router.get("/types/{type_id}/columns", response_model=list[ColumnDefResponse])
def get_dataset_type_columns(type_id: str):
    dt = get_dataset_type(type_id)
    if not dt:
        raise HTTPException(status_code=404, detail="Dataset type not found")
    return [
        ColumnDefResponse(
            name=c.name,
            description=c.description,
            data_type=c.data_type.value,
            required=c.required,
            max_length=c.max_length,
            min_value=c.min_value,
            format=c.format,
            notes=c.notes,
        )
        for c in dt.columns
    ]


# --- Dataset CRUD ---


@router.get("/", response_model=list[DatasetResponse])
def list_datasets(db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    return db.query(Dataset).order_by(Dataset.created_at.desc()).all()


@router.post("/", response_model=DatasetResponse, status_code=201)
def create_dataset(
    body: DatasetCreate,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    if not get_dataset_type(body.type):
        raise HTTPException(status_code=400, detail=f"Unknown dataset type: {body.type}")
    dataset = Dataset(**body.model_dump())
    db.add(dataset)
    db.commit()
    db.refresh(dataset)
    return dataset


@router.get("/{dataset_id}", response_model=DatasetResponse)
def get_dataset(
    dataset_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    dataset = db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


@router.patch("/{dataset_id}", response_model=DatasetResponse)
def update_dataset(
    dataset_id: int,
    body: DatasetUpdate,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    dataset = db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(dataset, key, value)
    db.commit()
    db.refresh(dataset)
    return dataset


@router.delete("/{dataset_id}", status_code=204)
def delete_dataset(
    dataset_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    dataset = db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    db.delete(dataset)
    db.commit()


# --- Data sources for a dataset ---


def _maybe_create_pending_run(db: Session, dataset_id: int) -> None:
    """Create a pending pipeline run if one doesn't already exist for this dataset."""
    existing = (
        db.query(PipelineRun)
        .filter(PipelineRun.dataset_id == dataset_id, PipelineRun.status == "pending")
        .first()
    )
    if not existing:
        run = PipelineRun(dataset_id=dataset_id, status="pending")
        db.add(run)


@router.post("/{dataset_id}/sources", response_model=DataSourceResponse, status_code=201)
def create_data_source(
    dataset_id: int,
    body: DataSourceCreate,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    dataset = db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    connector = db.get(Connector, body.connector_id)
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    ds = DataSource(
        dataset_id=dataset_id,
        connector_id=body.connector_id,
        bq_table=body.bq_table,
        status="pending_mapping",
    )
    db.add(ds)
    _maybe_create_pending_run(db, dataset_id)
    db.commit()
    db.refresh(ds)
    return DataSourceResponse(
        id=ds.id,
        dataset_id=ds.dataset_id,
        connector_id=ds.connector_id,
        bq_table=ds.bq_table,
        status=ds.status,
        created_at=ds.created_at,
        updated_at=ds.updated_at,
        connector_name=connector.name,
    )


@router.get("/{dataset_id}/sources", response_model=list[DataSourceResponse])
def list_data_sources(
    dataset_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    dataset = db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    sources = (
        db.query(DataSource)
        .filter(DataSource.dataset_id == dataset_id)
        .order_by(DataSource.created_at.desc())
        .all()
    )
    result = []
    for s in sources:
        connector = db.get(Connector, s.connector_id)
        result.append(
            DataSourceResponse(
                id=s.id,
                dataset_id=s.dataset_id,
                connector_id=s.connector_id,
                bq_table=s.bq_table,
                status=s.status,
                created_at=s.created_at,
                updated_at=s.updated_at,
                connector_name=connector.name if connector else "",
            )
        )
    return result


# --- Pipeline runs for a dataset ---


@router.post("/{dataset_id}/run", response_model=PipelineRunResponse, status_code=201)
def trigger_pipeline_run(
    dataset_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    dataset = db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    run = PipelineRun(dataset_id=dataset_id, status="pending")
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


@router.get("/{dataset_id}/runs", response_model=list[PipelineRunResponse])
def list_pipeline_runs(
    dataset_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    dataset = db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return (
        db.query(PipelineRun)
        .filter(PipelineRun.dataset_id == dataset_id)
        .order_by(PipelineRun.created_at.desc())
        .all()
    )
