"""Re-export shim for backward compatibility."""
from izakaya_api.core.dependencies import get_current_user, get_db

__all__ = ["get_current_user", "get_db"]
