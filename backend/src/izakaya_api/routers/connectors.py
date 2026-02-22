from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from izakaya_api.deps import get_current_user, get_db
from izakaya_api.models.connector import Connector
from izakaya_api.models.user import User
from izakaya_api.schemas.connector import (
    ConnectorCreateRequest,
    ConnectorCreateResponse,
    ConnectorResponse,
    ConnectorUpdate,
)
from izakaya_api.services.bigquery import list_tables
from izakaya_api.services.fivetran import (
    create_connection,
    delete_connection,
    get_connection,
    list_connector_types,
    trigger_sync,
)

router = APIRouter(prefix="/connectors", tags=["connectors"])


def _apply_fivetran_details(connector: Connector, details: dict) -> None:
    """Apply Fivetran API response fields to a Connector model instance."""
    connector.service = details["service"]
    connector.setup_state = details["setup_state"]
    connector.sync_state = details["sync_state"]
    connector.status = details["status"]
    if not connector.schema_name and details.get("schema_name"):
        connector.schema_name = details["schema_name"]
    connector.succeeded_at = details.get("succeeded_at")
    connector.failed_at = details.get("failed_at")
    connector.sync_frequency = details.get("sync_frequency")
    connector.schedule_type = details.get("schedule_type")
    connector.paused = details.get("paused", False)
    connector.daily_sync_time = details.get("daily_sync_time")


@router.get("/types")
def get_connector_types(_user: User = Depends(get_current_user)):
    return list_connector_types()


@router.get("", response_model=list[ConnectorResponse])
def list_connectors(db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    return db.query(Connector).order_by(Connector.created_at.desc()).all()


@router.post("", response_model=ConnectorCreateResponse, status_code=201)
def create_connector(
    body: ConnectorCreateRequest,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    ft = create_connection(body.service, body.name)
    connector = Connector(
        name=body.name,
        service=ft["service"],
        fivetran_connector_id=ft["fivetran_connector_id"],
        schema_name=ft["schema_name"],
    )
    db.add(connector)
    db.commit()
    db.refresh(connector)
    return ConnectorCreateResponse(
        id=connector.id,
        name=connector.name,
        connect_card_url=ft["connect_card_url"],
    )


@router.post("/{connector_id}/finalize", response_model=ConnectorResponse)
def finalize_connector(
    connector_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    connector = db.get(Connector, connector_id)
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    if not connector.fivetran_connector_id:
        raise HTTPException(status_code=400, detail="Connector not yet linked to Fivetran")
    details = get_connection(connector.fivetran_connector_id)
    if details["setup_state"] == "connected":
        trigger_sync(connector.fivetran_connector_id)
    _apply_fivetran_details(connector, details)
    db.commit()
    db.refresh(connector)
    return connector


@router.post("/{connector_id}/sync-status", response_model=ConnectorResponse)
def refresh_sync_status(
    connector_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    connector = db.get(Connector, connector_id)
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    if not connector.fivetran_connector_id:
        raise HTTPException(status_code=400, detail="Connector not yet linked to Fivetran")
    details = get_connection(connector.fivetran_connector_id)
    _apply_fivetran_details(connector, details)
    db.commit()
    db.refresh(connector)
    return connector


@router.post("/refresh-all", response_model=list[ConnectorResponse])
def refresh_all_connectors(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Refresh sync status for all connectors that have a Fivetran ID."""
    connectors = (
        db.query(Connector)
        .filter(Connector.fivetran_connector_id.isnot(None))
        .all()
    )
    for connector in connectors:
        try:
            details = get_connection(connector.fivetran_connector_id)
            _apply_fivetran_details(connector, details)
        except Exception:
            pass  # Don't fail the batch if one connector errors
    db.commit()
    return db.query(Connector).order_by(Connector.created_at.desc()).all()


@router.get("/{connector_id}", response_model=ConnectorResponse)
def get_connector(
    connector_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    connector = db.get(Connector, connector_id)
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    return connector


@router.patch("/{connector_id}", response_model=ConnectorResponse)
def update_connector(
    connector_id: int,
    body: ConnectorUpdate,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    connector = db.get(Connector, connector_id)
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(connector, key, value)
    db.commit()
    db.refresh(connector)
    return connector


@router.delete("/{connector_id}", status_code=204)
def delete_connector(
    connector_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    connector = db.get(Connector, connector_id)
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    if connector.fivetran_connector_id:
        delete_connection(connector.fivetran_connector_id)
    db.delete(connector)
    db.commit()


@router.get("/{connector_id}/tables")
def get_connector_tables(
    connector_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    connector = db.get(Connector, connector_id)
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    if not connector.schema_name:
        raise HTTPException(status_code=400, detail="Connector has no BQ schema")
    return list_tables(connector.schema_name)
