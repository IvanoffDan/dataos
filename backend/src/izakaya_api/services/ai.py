"""Re-export shim for backward compatibility."""
from izakaya_api.infra.ai.client import chat_json, get_client

__all__ = ["chat_json", "get_client"]
