from datetime import datetime

from pydantic import BaseModel


class DataSourceCreate(BaseModel):
    name: str
    description: str = ""
    dataset_type: str
    connector_id: int
    bq_table: str


class DataSourceUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class DataSourceResponse(BaseModel):
    id: int
    name: str
    description: str
    dataset_type: str
    connector_id: int
    bq_table: str
    status: str
    created_at: datetime
    updated_at: datetime
    connector_name: str = ""

    model_config = {"from_attributes": True}


class MappingItem(BaseModel):
    source_column: str = ""
    target_column: str
    static_value: str | None = None


class MappingBulkSave(BaseModel):
    mappings: list[MappingItem]


class MappingResponse(BaseModel):
    id: int
    data_source_id: int
    source_column: str | None
    target_column: str
    static_value: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AutoMapSuggestion(BaseModel):
    target_column: str
    source_column: str | None = None
    static_value: str | None = None
    confidence: float
    reasoning: str


class AutoMapResponse(BaseModel):
    suggestions: list[AutoMapSuggestion]
    skipped_count: int


class PipelineRunResponse(BaseModel):
    id: int
    data_source_id: int
    status: str
    started_at: datetime | None
    completed_at: datetime | None
    error_summary: str | None
    rows_processed: int
    rows_failed: int
    version: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ValidationErrorResponse(BaseModel):
    id: int
    pipeline_run_id: int
    data_source_id: int
    row_number: int
    column_name: str
    error_type: str
    error_message: str
    source_value: str | None

    model_config = {"from_attributes": True}
