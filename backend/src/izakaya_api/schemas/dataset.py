from pydantic import BaseModel


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
