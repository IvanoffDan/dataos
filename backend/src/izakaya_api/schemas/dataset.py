from datetime import datetime

from pydantic import BaseModel


class DatasetCreate(BaseModel):
    name: str
    description: str = ""


class DatasetUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class DatasetResponse(BaseModel):
    id: int
    name: str
    description: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
