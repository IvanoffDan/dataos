from sqlalchemy.orm import Session

from izakaya_api.domains.connectors.models import Connector


class ConnectorRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, connector_id: int) -> Connector | None:
        return self.db.get(Connector, connector_id)

    def list_all(self) -> list[Connector]:
        return self.db.query(Connector).order_by(Connector.created_at.desc()).all()

    def list_with_fivetran_id(self) -> list[Connector]:
        return (
            self.db.query(Connector)
            .filter(Connector.fivetran_connector_id.isnot(None))
            .all()
        )

    def create(self, connector: Connector) -> Connector:
        self.db.add(connector)
        self.db.flush()
        return connector

    def delete(self, connector: Connector) -> None:
        self.db.delete(connector)
        self.db.flush()
