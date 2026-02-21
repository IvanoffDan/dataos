import re

from fastapi import HTTPException
from google.api_core.exceptions import Forbidden, NotFound
from google.cloud import bigquery

from izakaya_api.bq import get_bq_client
from izakaya_api.config import settings

_SAFE_COL = re.compile(r"^[a-z_][a-z0-9_]*$")


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
        raise HTTPException(
            status_code=404,
            detail=f"BQ dataset '{schema_name}' not found. Has the connector completed its first sync?",
        )
    except Forbidden as e:
        raise HTTPException(
            status_code=403,
            detail=f"BQ access denied for dataset '{schema_name}'. Has the connector completed its first sync?",
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
        raise HTTPException(status_code=404, detail=f"BQ table '{schema_name}.{table_name}' not found")
    except Forbidden:
        raise HTTPException(status_code=403, detail=f"BQ access denied for table '{schema_name}.{table_name}'")


def _output_table(dataset_type: str) -> str:
    return f"`{settings.bq_project_id}.{settings.bq_dataset}.{dataset_type}`"


def _validate_column_name(col: str) -> None:
    if not _SAFE_COL.match(col):
        raise HTTPException(status_code=400, detail=f"Invalid column name: {col}")


def get_total_row_count(dataset_type: str) -> int | None:
    """Get total row count from the BQ output table. Returns None if table doesn't exist."""
    client = get_bq_client()
    try:
        result = client.query(f"SELECT COUNT(*) as cnt FROM {_output_table(dataset_type)}").result()
        return list(result)[0]["cnt"]
    except (NotFound, Forbidden):
        return None


def get_column_stats(dataset_type: str, column_names: list[str]) -> dict[str, dict]:
    """Get distinct count and non-null count for multiple columns via a single UNION ALL query.

    Returns {column_name: {"distinct_count": int, "non_null_count": int}} or {} if table unavailable.
    """
    if not column_names:
        return {}
    for col in column_names:
        _validate_column_name(col)

    client = get_bq_client()
    table = _output_table(dataset_type)
    parts = []
    for col in column_names:
        parts.append(
            f"SELECT '{col}' as col, COUNT(DISTINCT LOWER(CAST(`{col}` AS STRING))) as distinct_count, "
            f"COUNT(`{col}`) as non_null_count FROM {table}"
        )
    query = " UNION ALL ".join(parts)

    try:
        rows = list(client.query(query).result())
    except (NotFound, Forbidden):
        return {}

    return {
        row["col"]: {"distinct_count": row["distinct_count"], "non_null_count": row["non_null_count"]}
        for row in rows
    }


def get_column_value_frequencies(
    dataset_type: str,
    column_name: str,
    search: str | None = None,
    limit: int = 1000,
) -> list[dict] | None:
    """Get distinct lowercase values and their frequencies for a column.

    Returns list of {"value": str, "count": int} or None if table unavailable.
    """
    _validate_column_name(column_name)
    client = get_bq_client()
    table = _output_table(dataset_type)

    query = (
        f"SELECT LOWER(CAST(`{column_name}` AS STRING)) as value, COUNT(*) as count "
        f"FROM {table} WHERE `{column_name}` IS NOT NULL "
    )

    job_config = bigquery.QueryJobConfig()
    if search:
        query += "AND LOWER(CAST(`{col}` AS STRING)) LIKE @search ".format(col=column_name)
        job_config.query_parameters = [
            bigquery.ScalarQueryParameter("search", "STRING", f"%{search.lower()}%"),
        ]

    query += f"GROUP BY value ORDER BY count DESC LIMIT {int(limit)}"

    try:
        rows = list(client.query(query, job_config=job_config).result())
    except (NotFound, Forbidden):
        return None

    return [{"value": row["value"], "count": row["count"]} for row in rows]
