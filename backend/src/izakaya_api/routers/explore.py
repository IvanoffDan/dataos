from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from izakaya_api.dataset_types import get_dataset_type
from izakaya_api.deps import get_current_user, get_db
from izakaya_api.models.connector import Connector
from izakaya_api.models.data_source import DataSource
from izakaya_api.models.dataset import Dataset
from izakaya_api.models.user import User
from izakaya_api.schemas.explore import (
    BreakdownItem,
    BreakdownRequest,
    KpiSummaryResponse,
    MetricResponse,
    PreviewResponse,
    TableDataResponse,
    TimeSeriesPoint,
    TimeSeriesRequest,
)
from izakaya_api.services import bigquery as bq_service

router = APIRouter(prefix="/explore", tags=["explore"])


def _get_dataset_and_type(dataset_id: int, db: Session):
    dataset = db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    dt = get_dataset_type(dataset.type)
    if not dt:
        raise HTTPException(status_code=400, detail=f"Unknown dataset type: {dataset.type}")
    return dataset, dt


def _find_metric(dt, metric_id: str):
    for m in dt.metrics:
        if m.id == metric_id:
            return m
    raise HTTPException(status_code=400, detail=f"Unknown metric: {metric_id}")


@router.get("/datasets/{dataset_id}/summary", response_model=KpiSummaryResponse | None)
def get_summary(
    dataset_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    dataset, dt = _get_dataset_and_type(dataset_id, db)
    result = bq_service.get_kpi_summary(dataset.type, dt.metrics)
    if result is None:
        return KpiSummaryResponse(total_rows=0, min_date=None, max_date=None, metrics={})
    return result


@router.get("/datasets/{dataset_id}/metrics", response_model=list[MetricResponse])
def get_metrics(
    dataset_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    dataset, dt = _get_dataset_and_type(dataset_id, db)
    return [
        MetricResponse(id=m.id, name=m.name, format_type=m.format_type, default=m.default)
        for m in dt.metrics
    ]


@router.post("/datasets/{dataset_id}/time-series", response_model=list[TimeSeriesPoint])
def get_time_series(
    dataset_id: int,
    body: TimeSeriesRequest,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    dataset, dt = _get_dataset_and_type(dataset_id, db)
    metric = _find_metric(dt, body.metric_id)
    return bq_service.get_time_series(
        dataset_type=dataset.type,
        metric_sql=metric.sql_expression,
        granularity=body.granularity,
        group_by=body.group_by,
        date_from=body.date_from,
        date_to=body.date_to,
    )


@router.post("/datasets/{dataset_id}/breakdown", response_model=list[BreakdownItem])
def get_breakdown(
    dataset_id: int,
    body: BreakdownRequest,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    dataset, dt = _get_dataset_and_type(dataset_id, db)
    metric = _find_metric(dt, body.metric_id)
    return bq_service.get_dimension_breakdown(
        dataset_type=dataset.type,
        metric_sql=metric.sql_expression,
        group_by=body.group_by,
        date_from=body.date_from,
        date_to=body.date_to,
        limit=body.limit,
    )


@router.get("/datasets/{dataset_id}/data", response_model=TableDataResponse)
def get_data(
    dataset_id: int,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    sort_column: str | None = None,
    sort_dir: str = "desc",
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    dataset, dt = _get_dataset_and_type(dataset_id, db)
    return bq_service.get_table_data(
        dataset_type=dataset.type,
        offset=offset,
        limit=limit,
        sort_column=sort_column,
        sort_dir=sort_dir,
    )


@router.get("/data-sources/{data_source_id}/raw-preview", response_model=PreviewResponse)
def get_raw_preview(
    data_source_id: int,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    source = db.get(DataSource, data_source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Data source not found")
    connector = db.get(Connector, source.connector_id)
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    return bq_service.get_source_table_preview(
        schema_name=connector.schema_name,
        table_name=source.bq_table,
        offset=offset,
        limit=limit,
    )


@router.get("/data-sources/{data_source_id}/mapped-preview", response_model=PreviewResponse)
def get_mapped_preview(
    data_source_id: int,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    source = db.get(DataSource, data_source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Data source not found")
    dataset = db.get(Dataset, source.dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return bq_service.get_mapped_table_preview(
        dataset_type=dataset.type,
        data_source_id=data_source_id,
        offset=offset,
        limit=limit,
    )
