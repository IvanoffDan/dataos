from datetime import datetime

from pydantic import BaseModel


class PipelineRunResponse(BaseModel):
    id: int
    dataset_id: int
    status: str
    started_at: datetime | None
    completed_at: datetime | None
    error_summary: str | None
    rows_processed: int
    rows_failed: int
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
