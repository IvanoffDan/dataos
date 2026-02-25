"""Re-export shim for backward compatibility."""
from izakaya_api.core.dependencies import get_bq_client

__all__ = ["get_bq_client"]
