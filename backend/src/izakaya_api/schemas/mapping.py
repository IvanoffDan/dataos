from datetime import datetime

from pydantic import BaseModel


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
