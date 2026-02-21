from pydantic import BaseModel


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
    granularity: str = "weekly"  # daily, weekly, monthly
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
