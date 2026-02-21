from datetime import datetime

from pydantic import BaseModel


class DatasetCreate(BaseModel):
    name: str
    type: str
    description: str = ""


class DatasetUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class DatasetResponse(BaseModel):
    id: int
    name: str
    type: str
    description: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ColumnDefResponse(BaseModel):
    name: str
    description: str
    data_type: str
    required: bool
    max_length: int | None = None
    min_value: float | None = None
    format: str | None = None
    notes: str = ""


class DatasetTypeResponse(BaseModel):
    id: str
    name: str
    description: str
    grain: str
    duration: str
    columns: list[ColumnDefResponse]
