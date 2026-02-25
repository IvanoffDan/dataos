"""Analytics and data query functions for BigQuery."""
import re

from google.api_core.exceptions import BadRequest, Forbidden, NotFound
from google.cloud import bigquery

from izakaya_api.config import settings
from izakaya_api.core.dependencies import get_bq_client

_SAFE_COL = re.compile(r"^[a-z_][a-z0-9_]*$")


def _validate_column_name(col: str) -> None:
    from izakaya_api.core.exceptions import ValidationError as DomainValidationError

    if not _SAFE_COL.match(col):
        raise DomainValidationError(f"Invalid column name: {col}")


def _output_table(dataset_type: str) -> str:
    return f"`{settings.bq_project_id}.{settings.bq_dataset}.{dataset_type}`"


def _history_table(dataset_type: str) -> str:
    return f"`{settings.bq_project_id}.{settings.bq_dataset}.{dataset_type}_history`"


def _mapped_table(dataset_type: str) -> str:
    return f"`{settings.bq_project_id}.{settings.bq_dataset}.{dataset_type}_mapped`"


def get_total_row_count(dataset_type: str) -> int | None:
    """Get total row count from the BQ output table. Returns None if table doesn't exist."""
    client = get_bq_client()
    try:
        result = client.query(f"SELECT COUNT(*) as cnt FROM {_output_table(dataset_type)}").result()
        return list(result)[0]["cnt"]
    except (NotFound, Forbidden):
        return None


def get_column_stats(dataset_type: str, column_names: list[str]) -> dict[str, dict]:
    """Get distinct count and non-null count for multiple columns via a single UNION ALL query."""
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
    """Get distinct lowercase values and their frequencies for a column."""
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


def get_kpi_summary(dataset_type: str, metric_defs: list) -> dict | None:
    """Get KPI summary: total rows, date range, and metric values."""
    client = get_bq_client()
    table = _output_table(dataset_type)

    metric_sqls = [f"{m.sql_expression} AS {m.id}" for m in metric_defs]
    metrics_clause = ", ".join(metric_sqls)

    query = (
        f"SELECT COUNT(*) AS total_rows, MIN(date) AS min_date, MAX(date) AS max_date, "
        f"{metrics_clause} FROM {table}"
    )

    try:
        rows = list(client.query(query).result())
    except (NotFound, Forbidden, BadRequest):
        return None

    if not rows:
        return None

    row = rows[0]
    metrics = {}
    for m in metric_defs:
        val = row[m.id]
        metrics[m.id] = float(val) if val is not None else 0

    return {
        "total_rows": row["total_rows"],
        "min_date": str(row["min_date"]) if row["min_date"] else None,
        "max_date": str(row["max_date"]) if row["max_date"] else None,
        "metrics": metrics,
    }


def get_time_series(
    dataset_type: str,
    metric_sql: str,
    granularity: str,
    group_by: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    top_n: int = 10,
) -> list[dict]:
    """Get time series data for a metric with optional grouping."""
    client = get_bq_client()
    table = _output_table(dataset_type)

    trunc_map = {"daily": "DAY", "weekly": "ISOWEEK", "monthly": "MONTH"}
    trunc = trunc_map.get(granularity, "ISOWEEK")

    if trunc == "ISOWEEK":
        period_expr = "DATE_TRUNC(date, ISOWEEK)"
    else:
        period_expr = f"DATE_TRUNC(date, {trunc})"

    where_parts = []
    params = []
    if date_from:
        where_parts.append("date >= @date_from")
        params.append(bigquery.ScalarQueryParameter("date_from", "DATE", date_from))
    if date_to:
        where_parts.append("date <= @date_to")
        params.append(bigquery.ScalarQueryParameter("date_to", "DATE", date_to))

    where_clause = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""

    if group_by:
        _validate_column_name(group_by)
        top_query = (
            f"SELECT CAST(`{group_by}` AS STRING) AS grp, {metric_sql} AS val "
            f"FROM {table} {where_clause} "
            f"GROUP BY grp ORDER BY val DESC LIMIT {int(top_n)}"
        )
        job_config = bigquery.QueryJobConfig(query_parameters=params)
        try:
            top_rows = list(client.query(top_query, job_config=job_config).result())
        except (NotFound, Forbidden, BadRequest):
            return []
        top_groups = [r["grp"] for r in top_rows if r["grp"] is not None]

        if not top_groups:
            return []

        group_params = list(params)
        group_placeholders = []
        for i, g in enumerate(top_groups):
            param_name = f"grp_{i}"
            group_placeholders.append(f"@{param_name}")
            group_params.append(bigquery.ScalarQueryParameter(param_name, "STRING", g))

        extra_where = f"CAST(`{group_by}` AS STRING) IN ({', '.join(group_placeholders)})"
        if where_clause:
            full_where = f"{where_clause} AND {extra_where}"
        else:
            full_where = f"WHERE {extra_where}"

        query = (
            f"SELECT {period_expr} AS period, CAST(`{group_by}` AS STRING) AS grp, "
            f"{metric_sql} AS value "
            f"FROM {table} {full_where} "
            f"GROUP BY period, grp ORDER BY period"
        )
        params = group_params
    else:
        query = (
            f"SELECT {period_expr} AS period, {metric_sql} AS value "
            f"FROM {table} {where_clause} "
            f"GROUP BY period ORDER BY period"
        )

    job_config = bigquery.QueryJobConfig(query_parameters=params)
    try:
        rows = list(client.query(query, job_config=job_config).result())
    except (NotFound, Forbidden, BadRequest):
        return []

    return [
        {
            "period": str(r["period"]),
            "value": float(r["value"]) if r["value"] is not None else 0,
            **({"group": r["grp"]} if group_by else {}),
        }
        for r in rows
    ]


def get_dimension_breakdown(
    dataset_type: str,
    metric_sql: str,
    group_by: str,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = 20,
) -> list[dict]:
    """Get dimension breakdown for a metric."""
    _validate_column_name(group_by)
    client = get_bq_client()
    table = _output_table(dataset_type)

    where_parts = []
    params = []
    if date_from:
        where_parts.append("date >= @date_from")
        params.append(bigquery.ScalarQueryParameter("date_from", "DATE", date_from))
    if date_to:
        where_parts.append("date <= @date_to")
        params.append(bigquery.ScalarQueryParameter("date_to", "DATE", date_to))

    where_clause = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""

    query = (
        f"SELECT COALESCE(CAST(`{group_by}` AS STRING), 'Unknown') AS dimension, "
        f"{metric_sql} AS value "
        f"FROM {table} {where_clause} "
        f"GROUP BY dimension ORDER BY value DESC LIMIT {int(limit)}"
    )

    job_config = bigquery.QueryJobConfig(query_parameters=params)
    try:
        rows = list(client.query(query, job_config=job_config).result())
    except (NotFound, Forbidden, BadRequest):
        return []

    return [
        {"dimension": r["dimension"], "value": float(r["value"]) if r["value"] is not None else 0}
        for r in rows
    ]


def get_table_data(
    dataset_type: str,
    offset: int = 0,
    limit: int = 50,
    sort_column: str | None = None,
    sort_dir: str = "desc",
    filters: dict[str, str] | None = None,
) -> dict:
    """Get paginated data from the output table."""
    client = get_bq_client()
    table = _output_table(dataset_type)

    where_parts = []
    params = []
    if filters:
        for col, val in filters.items():
            _validate_column_name(col)
            param_name = f"f_{col}"
            where_parts.append(f"LOWER(CAST(`{col}` AS STRING)) LIKE @{param_name}")
            params.append(bigquery.ScalarQueryParameter(param_name, "STRING", f"%{val.lower()}%"))

    where_clause = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""

    count_query = f"SELECT COUNT(*) AS cnt FROM {table} {where_clause}"
    job_config = bigquery.QueryJobConfig(query_parameters=params)
    try:
        count_rows = list(client.query(count_query, job_config=job_config).result())
        total_count = count_rows[0]["cnt"]
    except (NotFound, Forbidden, BadRequest):
        return {"rows": [], "total_count": 0, "columns": []}

    order_clause = "ORDER BY date DESC"
    if sort_column:
        _validate_column_name(sort_column)
        direction = "ASC" if sort_dir.lower() == "asc" else "DESC"
        order_clause = f"ORDER BY `{sort_column}` {direction}"

    data_query = (
        f"SELECT * FROM {table} {where_clause} "
        f"{order_clause} LIMIT {int(limit)} OFFSET {int(offset)}"
    )
    job_config = bigquery.QueryJobConfig(query_parameters=params)
    result = client.query(data_query, job_config=job_config).result()
    columns = [field.name for field in result.schema]
    rows = [dict(row) for row in result]

    for row in rows:
        for k, v in row.items():
            if hasattr(v, "isoformat"):
                row[k] = v.isoformat()

    return {"rows": rows, "total_count": total_count, "columns": columns}


def get_source_table_preview(
    schema_name: str,
    table_name: str,
    offset: int = 0,
    limit: int = 50,
) -> dict:
    """Get paginated preview of a raw BQ source table."""
    client = get_bq_client()
    table_ref = f"`{settings.bq_project_id}.{schema_name}.{table_name}`"

    try:
        count_rows = list(client.query(f"SELECT COUNT(*) AS cnt FROM {table_ref}").result())
        total_count = count_rows[0]["cnt"]
    except (NotFound, Forbidden, BadRequest):
        return {"rows": [], "total_count": 0, "columns": []}

    query = f"SELECT * FROM {table_ref} LIMIT {int(limit)} OFFSET {int(offset)}"
    try:
        result = client.query(query).result()
        columns = [field.name for field in result.schema]
        rows = [dict(row) for row in result]
        for row in rows:
            for k, v in row.items():
                if hasattr(v, "isoformat"):
                    row[k] = v.isoformat()
        return {"rows": rows, "total_count": total_count, "columns": columns}
    except (NotFound, Forbidden, BadRequest):
        return {"rows": [], "total_count": 0, "columns": []}


def get_mapped_table_preview(
    dataset_type: str,
    data_source_id: int,
    offset: int = 0,
    limit: int = 50,
) -> dict:
    """Get paginated preview of mapped data for a specific data source."""
    client = get_bq_client()
    table = _mapped_table(dataset_type)

    try:
        count_query = f"SELECT COUNT(*) AS cnt FROM {table} WHERE __data_source_id = @ds_id"
        job_config = bigquery.QueryJobConfig(
            query_parameters=[bigquery.ScalarQueryParameter("ds_id", "INT64", data_source_id)]
        )
        count_rows = list(client.query(count_query, job_config=job_config).result())
        total_count = count_rows[0]["cnt"]
    except (NotFound, Forbidden, BadRequest):
        return {"rows": [], "total_count": 0, "columns": []}

    data_query = (
        f"SELECT * FROM {table} WHERE __data_source_id = @ds_id "
        f"LIMIT {int(limit)} OFFSET {int(offset)}"
    )
    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("ds_id", "INT64", data_source_id)]
    )
    try:
        result = client.query(data_query, job_config=job_config).result()
        columns = [field.name for field in result.schema]
        rows = [dict(row) for row in result]
        for row in rows:
            for k, v in row.items():
                if hasattr(v, "isoformat"):
                    row[k] = v.isoformat()
        return {"rows": rows, "total_count": total_count, "columns": columns}
    except (NotFound, Forbidden, BadRequest):
        return {"rows": [], "total_count": 0, "columns": []}


def get_history_kpi_summary(dataset_type: str, dataset_id: int, version: int, metric_defs: list) -> dict | None:
    """KPI summary from the history table for a specific dataset version."""
    client = get_bq_client()
    table = _history_table(dataset_type)

    metric_sqls = [f"{m.sql_expression} AS {m.id}" for m in metric_defs]
    metrics_clause = ", ".join(metric_sqls)

    query = (
        f"SELECT COUNT(*) AS total_rows, MIN(date) AS min_date, MAX(date) AS max_date, "
        f"{metrics_clause} FROM {table} "
        f"WHERE _dataset_id = @dataset_id AND _version = @version"
    )

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("dataset_id", "INT64", dataset_id),
            bigquery.ScalarQueryParameter("version", "INT64", version),
        ]
    )

    try:
        rows = list(client.query(query, job_config=job_config).result())
    except (NotFound, Forbidden, BadRequest):
        return None

    if not rows:
        return None

    row = rows[0]
    metrics = {}
    for m in metric_defs:
        val = row[m.id]
        metrics[m.id] = float(val) if val is not None else 0

    return {
        "total_rows": row["total_rows"],
        "min_date": str(row["min_date"]) if row["min_date"] else None,
        "max_date": str(row["max_date"]) if row["max_date"] else None,
        "metrics": metrics,
    }


def get_history_table_data(
    dataset_type: str,
    dataset_id: int,
    version: int,
    offset: int = 0,
    limit: int = 50,
    sort_column: str | None = None,
    sort_dir: str = "desc",
) -> dict:
    """Paginated data from the history table for a specific dataset version."""
    client = get_bq_client()
    table = _history_table(dataset_type)

    params = [
        bigquery.ScalarQueryParameter("dataset_id", "INT64", dataset_id),
        bigquery.ScalarQueryParameter("version", "INT64", version),
    ]
    where = "WHERE _dataset_id = @dataset_id AND _version = @version"

    count_query = f"SELECT COUNT(*) AS cnt FROM {table} {where}"
    job_config = bigquery.QueryJobConfig(query_parameters=params)
    try:
        count_rows = list(client.query(count_query, job_config=job_config).result())
        total_count = count_rows[0]["cnt"]
    except (NotFound, Forbidden, BadRequest):
        return {"rows": [], "total_count": 0, "columns": []}

    order_clause = "ORDER BY date DESC"
    if sort_column:
        _validate_column_name(sort_column)
        direction = "ASC" if sort_dir.lower() == "asc" else "DESC"
        order_clause = f"ORDER BY `{sort_column}` {direction}"

    data_query = (
        f"SELECT * EXCEPT(_version, _pipeline_run_id, _snapshot_at, _dataset_id) "
        f"FROM {table} {where} "
        f"{order_clause} LIMIT {int(limit)} OFFSET {int(offset)}"
    )
    job_config = bigquery.QueryJobConfig(query_parameters=params)
    try:
        result = client.query(data_query, job_config=job_config).result()
    except (NotFound, Forbidden, BadRequest):
        return {"rows": [], "total_count": 0, "columns": []}

    columns = [field.name for field in result.schema]
    rows = [dict(row) for row in result]

    for row in rows:
        for k, v in row.items():
            if hasattr(v, "isoformat"):
                row[k] = v.isoformat()

    return {"rows": rows, "total_count": total_count, "columns": columns}
