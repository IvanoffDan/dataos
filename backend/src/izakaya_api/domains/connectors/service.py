import logging

from izakaya_api.core.exceptions import NotFoundError, ValidationError
from izakaya_api.domains.connectors.models import Connector
from izakaya_api.domains.connectors.repository import ConnectorRepository
from izakaya_api.infra.bigquery.table_service import list_tables
from izakaya_api.infra.fivetran import client as fivetran

logger = logging.getLogger(__name__)


def apply_fivetran_details(connector: Connector, details: dict) -> None:
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


class ConnectorService:
    def __init__(self, repo: ConnectorRepository):
        self.repo = repo

    def list_connector_types(self) -> list[dict]:
        return fivetran.list_connector_types()

    def list_all(self) -> list[Connector]:
        return self.repo.list_all()

    def get(self, connector_id: int) -> Connector:
        connector = self.repo.get(connector_id)
        if not connector:
            raise NotFoundError("Connector not found")
        return connector

    def create(self, name: str, service: str) -> tuple[Connector, str]:
        """Create connector, returns (connector, connect_card_url)."""
        ft = fivetran.create_connection(service, name)
        connector = Connector(
            name=name,
            service=ft["service"],
            fivetran_connector_id=ft["fivetran_connector_id"],
            schema_name=ft["schema_name"],
        )
        self.repo.create(connector)
        return connector, ft["connect_card_url"]

    def finalize(self, connector_id: int) -> Connector:
        connector = self.get(connector_id)
        if not connector.fivetran_connector_id:
            raise ValidationError("Connector not yet linked to Fivetran")
        details = fivetran.get_connection(connector.fivetran_connector_id)
        if details["setup_state"] == "connected":
            fivetran.trigger_sync(connector.fivetran_connector_id)
        apply_fivetran_details(connector, details)
        return connector

    def refresh_sync_status(self, connector_id: int) -> Connector:
        connector = self.get(connector_id)
        if not connector.fivetran_connector_id:
            raise ValidationError("Connector not yet linked to Fivetran")
        details = fivetran.get_connection(connector.fivetran_connector_id)
        apply_fivetran_details(connector, details)
        return connector

    def refresh_all(self) -> list[Connector]:
        connectors = self.repo.list_with_fivetran_id()
        for connector in connectors:
            try:
                details = fivetran.get_connection(connector.fivetran_connector_id)
                apply_fivetran_details(connector, details)
            except Exception:
                pass
        return self.repo.list_all()

    def update(self, connector_id: int, data: dict) -> Connector:
        connector = self.get(connector_id)
        for key, value in data.items():
            setattr(connector, key, value)
        return connector

    def delete(self, connector_id: int) -> None:
        connector = self.get(connector_id)
        if connector.fivetran_connector_id:
            fivetran.delete_connection(connector.fivetran_connector_id)
        self.repo.delete(connector)

    def get_tables(self, connector_id: int) -> list[dict]:
        connector = self.get(connector_id)
        if not connector.schema_name:
            raise ValidationError("Connector has no BQ schema")
        return list_tables(connector.schema_name)
