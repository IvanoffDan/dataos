"""Re-export for backward compat — actual client is in core.dependencies."""
from izakaya_api.core.dependencies import get_bq_client

__all__ = ["get_bq_client"]
