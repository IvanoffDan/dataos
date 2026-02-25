class DomainError(Exception):
    """Base exception for all domain errors."""

    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class NotFoundError(DomainError):
    """Resource not found."""

    def __init__(self, message: str = "Not found"):
        super().__init__(message, status_code=404)


class ValidationError(DomainError):
    """Domain validation error."""

    def __init__(self, message: str = "Validation error"):
        super().__init__(message, status_code=400)


class ExternalServiceError(DomainError):
    """External service (Fivetran, BQ, AI) error."""

    def __init__(self, message: str = "External service error"):
        super().__init__(message, status_code=502)


class AuthenticationError(DomainError):
    """Authentication failure."""

    def __init__(self, message: str = "Not authenticated"):
        super().__init__(message, status_code=401)


class ForbiddenError(DomainError):
    """Access denied."""

    def __init__(self, message: str = "Access denied"):
        super().__init__(message, status_code=403)


class ServiceUnavailableError(DomainError):
    """Service not configured or unavailable."""

    def __init__(self, message: str = "Service unavailable"):
        super().__init__(message, status_code=503)
