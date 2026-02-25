"""Connector type → dbt transform configuration registry.

Maps Fivetran service types to their dbt model and category. The dbt_staging
asset uses this to determine which model to run and what vars to pass.
"""

from dataclasses import dataclass
from enum import Enum


class ConnectorCategory(str, Enum):
    API = "api"
    FILE_SYSTEM = "file_system"
    DB = "db"
    PASSTHROUGH = "passthrough"


@dataclass(frozen=True)
class TransformConfig:
    service: str
    category: ConnectorCategory
    dbt_model: str
    staging_table: str
    display_name: str
    requires_table_selection: bool


# ---- Registry ----------------------------------------------------------------

TRANSFORM_REGISTRY: dict[str, TransformConfig] = {
    # API — dbt model hard-codes source tables, no user table selection
    "facebook_ads": TransformConfig(
        service="facebook_ads",
        category=ConnectorCategory.API,
        dbt_model="stg_facebook_ads",
        staging_table="stg_facebook_ads",
        display_name="Meta Ads",
        requires_table_selection=False,
    ),
    "google_ads": TransformConfig(
        service="google_ads",
        category=ConnectorCategory.API,
        dbt_model="stg_google_ads",
        staging_table="stg_google_ads",
        display_name="Google Ads",
        requires_table_selection=False,
    ),
    # File System — auto-detect table from Fivetran schema API
    "sftp": TransformConfig(
        service="sftp",
        category=ConnectorCategory.FILE_SYSTEM,
        dbt_model="stg_file_system",
        staging_table="stg_file_system",
        display_name="SFTP",
        requires_table_selection=False,
    ),
    "s3": TransformConfig(
        service="s3",
        category=ConnectorCategory.FILE_SYSTEM,
        dbt_model="stg_file_system",
        staging_table="stg_file_system",
        display_name="S3",
        requires_table_selection=False,
    ),
    "gcs": TransformConfig(
        service="gcs",
        category=ConnectorCategory.FILE_SYSTEM,
        dbt_model="stg_file_system",
        staging_table="stg_file_system",
        display_name="GCS",
        requires_table_selection=False,
    ),
    # Database — user selects which table (DB connectors sync many tables)
    "postgres": TransformConfig(
        service="postgres",
        category=ConnectorCategory.DB,
        dbt_model="stg_database",
        staging_table="stg_database",
        display_name="PostgreSQL",
        requires_table_selection=True,
    ),
    "mysql": TransformConfig(
        service="mysql",
        category=ConnectorCategory.DB,
        dbt_model="stg_database",
        staging_table="stg_database",
        display_name="MySQL",
        requires_table_selection=True,
    ),
}

_DEFAULT_CONFIG = TransformConfig(
    service="__default__",
    category=ConnectorCategory.PASSTHROUGH,
    dbt_model="stg_passthrough",
    staging_table="stg_passthrough",
    display_name="Standard",
    requires_table_selection=True,
)


def get_transform_config(service: str) -> TransformConfig:
    """Always returns a config — falls back to passthrough for unknown services."""
    return TRANSFORM_REGISTRY.get(service, _DEFAULT_CONFIG)


def get_connector_category(service: str) -> ConnectorCategory:
    return get_transform_config(service).category
