class BaseAppException(Exception):
    """
    Base exception for all application errors.
    """

    def __init__(
        self,
        message: str,
        code: int,
        success: bool = False,
        data: dict | None = None,
    ):
        self.message = message
        self.code = code
        self.success = success
        self.data = data

        super().__init__(message)


# Backwards-compat alias — older modules (e.g.
# ``src.embedding.domain.errors``) imported a class named
# ``CortexException``; the real name is ``BaseAppException``.
CortexException = BaseAppException


class ValidationException(BaseAppException):
    """
    Exception raised for validation errors.
    """

    def __init__(
        self,
        message: str = "validation failed",
        code: int = 400,
        data: dict | None = None,
    ):
        super().__init__(message, code, False, data=data)


class UnauthorizedException(BaseAppException):
    """
    Exception raised for unauthorized access.
    """

    def __init__(self, message: str = "unauthorized", code: int = 401, data: dict | None = None):
        super().__init__(message, code, False, data=data)


class ForbiddenException(BaseAppException):
    """
    Exception raised for forbidden access.

    Distinct from :class:`UnauthorizedException`
    (401) so the API can return the spec's
    required 403 for cross-tenant and
    role-violation cases — the request was
    authenticated, the policy just doesn't
    allow the action.
    """

    def __init__(self, message: str = "forbidden", code: int = 403, data: dict | None = None):
        super().__init__(message, code, False, data=data)


class NotFoundException(BaseAppException):
    """
    Exception raised when a resource is not found.
    """

    def __init__(self, message: str = "not found", code: int = 404, data: dict | None = None):
        super().__init__(message, code, False, data=data)


class ConflictException(BaseAppException):
    """
    Exception raised for conflict errors.
    """

    def __init__(self, message: str = "conflict", code: int = 409, data: dict | None = None):
        super().__init__(message, code, False, data=data)
