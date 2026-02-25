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
