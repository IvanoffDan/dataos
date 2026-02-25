from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from izakaya_api.core.dependencies import get_current_user, get_db
from izakaya_api.domains.analytics.queries import DashboardQueryService, ExploreQueryService
from izakaya_api.domains.analytics.schemas import (
    BreakdownItem,
    BreakdownRequest,
    DashboardResponse,
    KpiSummaryResponse,
    MetricResponse,
    PreviewResponse,
    TableDataResponse,
    TimeSeriesPoint,
    TimeSeriesRequest,
)

router = APIRouter(tags=["analytics"])


def _dashboard_svc(db: Session = Depends(get_db)) -> DashboardQueryService:
    return DashboardQueryService(db)


def _explore_svc(db: Session = Depends(get_db)) -> ExploreQueryService:
    return ExploreQueryService(db)


@router.get("/dashboard", response_model=DashboardResponse)
def get_dashboard(
    _: None = Depends(get_current_user),
    svc: DashboardQueryService = Depends(_dashboard_svc),
):
    return svc.get_dashboard()


@router.get("/explore/data-sources/{data_source_id}/summary", response_model=KpiSummaryResponse | None)
def get_summary(
    data_source_id: int,
    _: None = Depends(get_current_user),
    svc: ExploreQueryService = Depends(_explore_svc),
):
    return svc.get_summary(data_source_id)


@router.get("/explore/data-sources/{data_source_id}/metrics", response_model=list[MetricResponse])
def get_metrics(
    data_source_id: int,
    _: None = Depends(get_current_user),
    svc: ExploreQueryService = Depends(_explore_svc),
):
    return svc.get_metrics(data_source_id)


@router.post("/explore/data-sources/{data_source_id}/time-series", response_model=list[TimeSeriesPoint])
def get_time_series(
    data_source_id: int,
    body: TimeSeriesRequest,
    _: None = Depends(get_current_user),
    svc: ExploreQueryService = Depends(_explore_svc),
):
    return svc.get_time_series(data_source_id, body)


@router.post("/explore/data-sources/{data_source_id}/breakdown", response_model=list[BreakdownItem])
def get_breakdown(
    data_source_id: int,
    body: BreakdownRequest,
    _: None = Depends(get_current_user),
    svc: ExploreQueryService = Depends(_explore_svc),
):
    return svc.get_breakdown(data_source_id, body)


@router.get("/explore/data-sources/{data_source_id}/data", response_model=TableDataResponse)
def get_data(
    data_source_id: int,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    sort_column: str | None = None,
    sort_dir: str = "desc",
    _: None = Depends(get_current_user),
    svc: ExploreQueryService = Depends(_explore_svc),
):
    return svc.get_data(data_source_id, offset, limit, sort_column, sort_dir)


@router.get("/explore/data-sources/{data_source_id}/raw-preview", response_model=PreviewResponse)
def get_raw_preview(
    data_source_id: int,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    _: None = Depends(get_current_user),
    svc: ExploreQueryService = Depends(_explore_svc),
):
    return svc.get_raw_preview(data_source_id, offset, limit)


@router.get("/explore/data-sources/{data_source_id}/mapped-preview", response_model=PreviewResponse)
def get_mapped_preview(
    data_source_id: int,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    _: None = Depends(get_current_user),
    svc: ExploreQueryService = Depends(_explore_svc),
):
    return svc.get_mapped_preview(data_source_id, offset, limit)
