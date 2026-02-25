from datetime import datetime

from pydantic import BaseModel


class ReleaseCreate(BaseModel):
    name: str
    description: str | None = None


class ReleaseEntryResponse(BaseModel):
    id: int
    data_source_id: int
    data_source_name: str | None = None
    dataset_type: str | None = None
    pipeline_run_version: int
    rows_processed: int

    model_config = {"from_attributes": True}


class ReleaseResponse(BaseModel):
    id: int
    version: int
    name: str
    description: str | None
    created_by: int
    created_at: datetime
    entries: list[ReleaseEntryResponse] = []

    model_config = {"from_attributes": True}


class ReleaseListItem(BaseModel):
    id: int
    version: int
    name: str
    description: str | None
    created_at: datetime
    data_source_count: int = 0
    total_rows: int = 0

    model_config = {"from_attributes": True}


class DataSourceDiff(BaseModel):
    data_source_id: int
    data_source_name: str
    dataset_type: str
    r1_version: int | None = None
    r1_rows: int | None = None
    r2_version: int | None = None
    r2_rows: int | None = None


class ReleaseCompareResponse(BaseModel):
    r1: ReleaseListItem
    r2: ReleaseListItem
    diffs: list[DataSourceDiff]
