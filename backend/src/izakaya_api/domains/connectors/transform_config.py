"""Connector type → transform configuration (backend mirror).

Lightweight mirror of the pipeline's transform registry. Contains only the
metadata the backend needs — no dbt details.
"""

from enum import Enum


class ConnectorCategory(str, Enum):
    API = "api"
    FILE_SYSTEM = "file_system"
    DB = "db"
    PASSTHROUGH = "passthrough"


_CONNECTOR_CATEGORIES: dict[str, ConnectorCategory] = {
    "facebook_ads": ConnectorCategory.API,
    "google_ads": ConnectorCategory.API,
    "sftp": ConnectorCategory.FILE_SYSTEM,
    "s3": ConnectorCategory.FILE_SYSTEM,
    "gcs": ConnectorCategory.FILE_SYSTEM,
    "postgres": ConnectorCategory.DB,
    "mysql": ConnectorCategory.DB,
}

_STAGING_TABLES: dict[str, str] = {
    "facebook_ads": "stg_facebook_ads",
    "google_ads": "stg_google_ads",
    "sftp": "stg_file_system",
    "s3": "stg_file_system",
    "gcs": "stg_file_system",
    "postgres": "stg_database",
    "mysql": "stg_database",
}

_NO_TABLE_SELECTION = {"facebook_ads", "google_ads", "sftp", "s3", "gcs"}


def get_connector_category(service: str) -> ConnectorCategory:
    return _CONNECTOR_CATEGORIES.get(service, ConnectorCategory.PASSTHROUGH)


def get_staging_table(service: str) -> str:
    return _STAGING_TABLES.get(service, "stg_passthrough")


def requires_table_selection(service: str) -> bool:
    """Returns False for API and File System connectors (auto-detected)."""
    return service not in _NO_TABLE_SELECTION
