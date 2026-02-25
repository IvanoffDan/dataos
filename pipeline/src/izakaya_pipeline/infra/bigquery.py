"""Pipeline-specific BigQuery helper functions.

These accept a bigquery.Client parameter (unlike the backend's singleton pattern).
"""
import re

from google.api_core.exceptions import BadRequest, Forbidden, NotFound
from google.cloud import bigquery

_SAFE_COL = re.compile(r"^[a-z_][a-z0-9_]*$")


def _validate_col(col: str) -> None:
    if not _SAFE_COL.match(col):
        raise ValueError(f"Invalid column name: {col}")


def get_table_columns(
    client: bigquery.Client, project: str, schema: str, table: str
) -> list[dict]:
    """List column names and types for a BQ table, excluding Fivetran internals."""
    table_ref = f"{project}.{schema}.{table}"
    tbl = client.get_table(table_ref)
    return [
        {"name": f.name, "type": f.field_type}
        for f in tbl.schema
        if not f.name.startswith("_fivetran_")
    ]


def get_sample_values(
    client: bigquery.Client,
    project: str,
    schema: str,
    table: str,
    column_names: list[str],
    limit: int = 5,
) -> dict[str, list[str]]:
    """Fetch top distinct values per source column via a single UNION ALL query."""
    if not column_names:
        return {}
    for col in column_names:
        _validate_col(col)

    table_ref = f"`{project}.{schema}.{table}`"
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


def get_column_value_frequencies(
    client: bigquery.Client,
    project: str,
    dataset: str,
    table: str,
    column: str,
    limit: int = 1000,
) -> list[dict] | None:
    """Get distinct lowercase values and their frequencies for a column."""
    _validate_col(column)
    table_ref = f"`{project}.{dataset}.{table}`"

    query = (
        f"SELECT LOWER(CAST(`{column}` AS STRING)) as value, COUNT(*) as count "
        f"FROM {table_ref} WHERE `{column}` IS NOT NULL "
        f"GROUP BY value ORDER BY count DESC LIMIT {int(limit)}"
    )

    try:
        rows = list(client.query(query).result())
    except (NotFound, Forbidden, BadRequest):
        return None

    return [{"value": row["value"], "count": row["count"]} for row in rows]
