from fastapi import HTTPException
from google.api_core.exceptions import Forbidden, NotFound

from izakaya_api.bq import get_bq_client
from izakaya_api.config import settings


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
