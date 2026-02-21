import os

from dagster import ConfigurableResource
from google.cloud import bigquery
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker


class DatabaseResource(ConfigurableResource):
    connection_url: str = "postgresql://izakaya:izakaya@localhost:55432/izakaya"

    def get_session(self) -> Session:
        engine = create_engine(self.connection_url)
        return sessionmaker(bind=engine)()


class BigQueryResource(ConfigurableResource):
    project_id: str = ""
    dataset: str = "izakaya_warehouse"

    def get_client(self) -> bigquery.Client:
        return bigquery.Client(project=self.project_id)
