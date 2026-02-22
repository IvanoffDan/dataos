import os

from dagster import ConfigurableResource
from google.cloud import bigquery
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker


_db_engines: dict[str, object] = {}


class DatabaseResource(ConfigurableResource):
    connection_url: str = "postgresql://izakaya:izakaya@localhost:55432/izakaya"

    def get_session(self) -> Session:
        if self.connection_url not in _db_engines:
            _db_engines[self.connection_url] = create_engine(
                self.connection_url, pool_size=2, max_overflow=3
            )
        return sessionmaker(bind=_db_engines[self.connection_url])()


class BigQueryResource(ConfigurableResource):
    project_id: str = ""
    dataset: str = "izakaya_warehouse"

    def get_client(self) -> bigquery.Client:
        return bigquery.Client(project=self.project_id)
