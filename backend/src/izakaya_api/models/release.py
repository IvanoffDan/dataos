"""Re-export shim for backward compatibility."""
from izakaya_api.domains.releases.models import Release, ReleaseEntry

__all__ = ["Release", "ReleaseEntry"]
