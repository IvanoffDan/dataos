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


class DatasetSummary(BaseModel):
    id: int
    name: str
    type: str
    source_count: int
    latest_run_status: str | None = None
    latest_run_at: datetime | None = None
    rule_count: int


class RecentRunItem(BaseModel):
    id: int
    dataset_id: int
    dataset_name: str
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

    dataset_count: int

    total_runs: int
    runs_succeeded: int
    runs_failed: int
    total_rows_processed: int

    total_label_rules: int
    datasets_with_rules: int

    connectors: list[ConnectorSummary]
    datasets: list[DatasetSummary]
    recent_runs: list[RecentRunItem]
