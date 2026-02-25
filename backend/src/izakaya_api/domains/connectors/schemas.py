from datetime import datetime

from pydantic import BaseModel


class ConnectorCreateRequest(BaseModel):
    name: str
    service: str


class ConnectorCreateResponse(BaseModel):
    id: int
    name: str
    connect_card_url: str


class ConnectorFinalize(BaseModel):
    fivetran_connector_id: str


class ConnectorUpdate(BaseModel):
    name: str | None = None
    status: str | None = None
    setup_state: str | None = None
    sync_state: str | None = None


class ConnectorResponse(BaseModel):
    id: int
    name: str
    fivetran_connector_id: str | None
    service: str
    status: str
    setup_state: str
    sync_state: str | None
    schema_name: str
    succeeded_at: datetime | None = None
    failed_at: datetime | None = None
    sync_frequency: int | None = None
    schedule_type: str | None = None
    paused: bool = False
    daily_sync_time: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
