from datetime import datetime

from pydantic import BaseModel


class ConnectorSummary(BaseModel):
    id: int
    name: str
    service: str
    status: str
    paused: bool
    succeeded_at: datetime | None = None
    failed_at: datetime | None = None
    sync_state: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class DataSourceSummary(BaseModel):
    id: int
    name: str
    dataset_type: str
    connector_name: str
    latest_run_status: str | None = None
    latest_run_at: datetime | None = None
    rule_count: int


class RecentRunItem(BaseModel):
    id: int
    data_source_id: int
    data_source_name: str
    status: str
    rows_processed: int
    completed_at: datetime | None = None
    created_at: datetime


class DashboardResponse(BaseModel):
    connector_count: int
    connectors_healthy: int
    connectors_failing: int
    connectors_syncing: int
    latest_sync: datetime | None = None

    data_source_count: int

    total_runs: int
    runs_succeeded: int
    runs_failed: int
    total_rows_processed: int

    total_label_rules: int
    types_with_rules: int

    connectors: list[ConnectorSummary]
    data_sources: list[DataSourceSummary]
    recent_runs: list[RecentRunItem]


class MetricResponse(BaseModel):
    id: str
    name: str
    format_type: str
    default: bool


class KpiSummaryResponse(BaseModel):
    total_rows: int
    min_date: str | None
    max_date: str | None
    metrics: dict[str, float]


class TimeSeriesRequest(BaseModel):
    metric_id: str
    granularity: str = "weekly"
    group_by: str | None = None
    date_from: str | None = None
    date_to: str | None = None


class TimeSeriesPoint(BaseModel):
    period: str
    value: float
    group: str | None = None


class BreakdownRequest(BaseModel):
    metric_id: str
    group_by: str
    date_from: str | None = None
    date_to: str | None = None
    limit: int = 20


class BreakdownItem(BaseModel):
    dimension: str
    value: float


class TableDataResponse(BaseModel):
    rows: list[dict]
    total_count: int
    columns: list[str]


class PreviewResponse(BaseModel):
    rows: list[dict]
    total_count: int
    columns: list[str]
