from datetime import datetime

from pydantic import BaseModel


class DataSourceCreate(BaseModel):
    connector_id: int
    bq_table: str


class DataSourceResponse(BaseModel):
    id: int
    dataset_id: int
    connector_id: int
    bq_table: str
    status: str
    created_at: datetime
    updated_at: datetime
    connector_name: str = ""

    model_config = {"from_attributes": True}
