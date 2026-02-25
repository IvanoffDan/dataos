"""Re-export shim for backward compatibility."""
from izakaya_api.domains.auth.service import hash_password, verify_password

__all__ = ["hash_password", "verify_password"]
