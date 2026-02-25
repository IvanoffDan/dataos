import re

from google.api_core.exceptions import BadRequest, Forbidden, NotFound
from google.cloud import bigquery

from izakaya_api.config import settings
from izakaya_api.core.dependencies import get_bq_client
from izakaya_api.core.exceptions import ExternalServiceError, ForbiddenError, NotFoundError

_SAFE_COL = re.compile(r"^[a-z_][a-z0-9_]*$")


def validate_column_name(col: str) -> None:
    from izakaya_api.core.exceptions import ValidationError as DomainValidationError

    if not _SAFE_COL.match(col):
        raise DomainValidationError(f"Invalid column name: {col}")


def list_tables(schema_name: str) -> list[dict]:
    """List BQ tables in a Fivetran-managed schema."""
    client = get_bq_client()
    dataset_ref = f"{settings.bq_project_id}.{schema_name}"
    try:
        tables = []
        for table in client.list_tables(dataset_ref):
            tables.append({"table_id": table.table_id, "full_id": f"{dataset_ref}.{table.table_id}"})
        return tables
    except NotFound:
        raise NotFoundError(
            f"BQ dataset '{schema_name}' not found. Has the connector completed its first sync?"
        )
    except Forbidden:
        raise ForbiddenError(
            f"BQ access denied for dataset '{schema_name}'. Has the connector completed its first sync?"
        )


def get_table_columns(schema_name: str, table_name: str) -> list[dict]:
    """Get column names and types for a BQ table."""
    client = get_bq_client()
    table_ref = f"{settings.bq_project_id}.{schema_name}.{table_name}"
    try:
        table = client.get_table(table_ref)
        return [
            {"name": field.name, "type": field.field_type}
            for field in table.schema
            if not field.name.startswith("_fivetran_")
        ]
    except NotFound:
        raise NotFoundError(f"BQ table '{schema_name}.{table_name}' not found")
    except Forbidden:
        raise ForbiddenError(f"BQ access denied for table '{schema_name}.{table_name}'")


def get_sample_values(
    schema_name: str,
    table_name: str,
    column_names: list[str],
    limit: int = 5,
) -> dict[str, list[str]]:
    """Fetch top distinct values per source column via a single UNION ALL query."""
    if not column_names:
        return {}
    for col in column_names:
        validate_column_name(col)

    client = get_bq_client()
    table_ref = f"`{settings.bq_project_id}.{schema_name}.{table_name}`"
    parts = []
    for col in column_names:
        parts.append(
            f"SELECT '{col}' AS col, CAST(`{col}` AS STRING) AS val "
            f"FROM (SELECT DISTINCT `{col}` FROM {table_ref} "
            f"WHERE `{col}` IS NOT NULL LIMIT {int(limit)})"
        )
    query = " UNION ALL ".join(parts)

    try:
        rows = list(client.query(query).result())
    except (NotFound, Forbidden, BadRequest):
        return {}

    result: dict[str, list[str]] = {}
    for row in rows:
        result.setdefault(row["col"], []).append(row["val"])
    return result
