import re
from contextlib import contextmanager

from dagster import ConfigurableResource
from google.cloud import bigquery
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker


_db_engines: dict[str, object] = {}

_IDENTIFIER_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")


def validate_identifier(name: str) -> str:
    """Validate that a string is a safe SQL identifier (prevents injection)."""
    if not _IDENTIFIER_RE.match(name):
        raise ValueError(f"Invalid SQL identifier: {name!r}")
    return name


class DatabaseResource(ConfigurableResource):
    connection_url: str = "postgresql://izakaya:izakaya@localhost:55432/izakaya"

    def get_session(self) -> Session:
        if self.connection_url not in _db_engines:
            _db_engines[self.connection_url] = create_engine(
                self.connection_url, pool_size=2, max_overflow=3, pool_pre_ping=True
            )
        return sessionmaker(bind=_db_engines[self.connection_url])()

    @contextmanager
    def session(self):
        """Context manager for DB sessions — auto-closes on exit."""
        session = self.get_session()
        try:
            yield session
        finally:
            session.close()


class BigQueryResource(ConfigurableResource):
    project_id: str = ""
    dataset: str = "izakaya_warehouse"

    def get_client(self) -> bigquery.Client:
        return bigquery.Client(project=self.project_id)

    def qualified_table(self, table_name: str) -> str:
        """Return fully-qualified BQ table reference: project.dataset.table."""
        validate_identifier(table_name)
        return f"{self.project_id}.{self.dataset}.{table_name}"
