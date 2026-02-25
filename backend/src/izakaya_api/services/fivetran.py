"""Re-export shim for backward compatibility."""
from izakaya_api.infra.fivetran.client import (
    create_connection,
    delete_connection,
    get_connection,
    list_connector_types,
    trigger_sync,
)

__all__ = [
    "create_connection",
    "delete_connection",
    "get_connection",
    "list_connector_types",
    "trigger_sync",
]
