from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from izakaya_api.core.dependencies import get_current_user, get_db
from izakaya_api.domains.auth.models import User
from izakaya_api.domains.connectors.repository import ConnectorRepository
from izakaya_api.domains.connectors.schemas import (
    ConnectorCreateRequest,
    ConnectorCreateResponse,
    ConnectorResponse,
    ConnectorUpdate,
)
from izakaya_api.domains.connectors.service import ConnectorService
from izakaya_api.domains.connectors.transform_config import requires_table_selection

router = APIRouter(prefix="/connectors", tags=["connectors"])


def _get_service(db: Session = Depends(get_db)) -> ConnectorService:
    return ConnectorService(ConnectorRepository(db))


def _connector_response(connector) -> ConnectorResponse:
    resp = ConnectorResponse.model_validate(connector)
    resp.requires_table_selection = requires_table_selection(connector.service)
    return resp


@router.get("/types")
def get_connector_types(
    _user: User = Depends(get_current_user),
    svc: ConnectorService = Depends(_get_service),
):
    return svc.list_connector_types()


@router.get("", response_model=list[ConnectorResponse])
def list_connectors(
    _user: User = Depends(get_current_user),
    svc: ConnectorService = Depends(_get_service),
):
    return [_connector_response(c) for c in svc.list_all()]


@router.post("", response_model=ConnectorCreateResponse, status_code=201)
def create_connector(
    body: ConnectorCreateRequest,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    svc: ConnectorService = Depends(_get_service),
):
    connector, connect_card_url = svc.create(body.name, body.service)
    db.commit()
    db.refresh(connector)
    return ConnectorCreateResponse(
        id=connector.id,
        name=connector.name,
        connect_card_url=connect_card_url,
    )


@router.post("/{connector_id}/finalize", response_model=ConnectorResponse)
def finalize_connector(
    connector_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    svc: ConnectorService = Depends(_get_service),
):
    connector = svc.finalize(connector_id)
    db.commit()
    db.refresh(connector)
    return connector


@router.post("/{connector_id}/sync-status", response_model=ConnectorResponse)
def refresh_sync_status(
    connector_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    svc: ConnectorService = Depends(_get_service),
):
    connector = svc.refresh_sync_status(connector_id)
    db.commit()
    db.refresh(connector)
    return connector


@router.post("/refresh-all", response_model=list[ConnectorResponse])
def refresh_all_connectors(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    svc: ConnectorService = Depends(_get_service),
):
    result = svc.refresh_all()
    db.commit()
    return result


@router.get("/{connector_id}", response_model=ConnectorResponse)
def get_connector(
    connector_id: int,
    _user: User = Depends(get_current_user),
    svc: ConnectorService = Depends(_get_service),
):
    return _connector_response(svc.get(connector_id))


@router.patch("/{connector_id}", response_model=ConnectorResponse)
def update_connector(
    connector_id: int,
    body: ConnectorUpdate,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    svc: ConnectorService = Depends(_get_service),
):
    connector = svc.update(connector_id, body.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(connector)
    return connector


@router.delete("/{connector_id}", status_code=204)
def delete_connector(
    connector_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    svc: ConnectorService = Depends(_get_service),
):
    svc.delete(connector_id)
    db.commit()


@router.get("/{connector_id}/tables")
def get_connector_tables(
    connector_id: int,
    _user: User = Depends(get_current_user),
    svc: ConnectorService = Depends(_get_service),
):
    return svc.get_tables(connector_id)


@router.post("/{connector_id}/retransform", status_code=202)
def trigger_retransform(
    connector_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    svc: ConnectorService = Depends(_get_service),
):
    """Manually trigger dbt re-transform for all mapped data sources on this connector."""
    created = svc.retransform(connector_id, db)
    db.commit()
    return {"message": f"Triggered retransform for {created} data source(s)"}
