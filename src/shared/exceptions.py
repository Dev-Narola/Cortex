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

    def __init__(
        self, message: str = "unauthorized", code: int = 401, data: dict | None = None
    ):
        super().__init__(message, code, False, data=data)


class NotFoundException(BaseAppException):
    """
    Exception raised when a resource is not found.
    """

    def __init__(
        self, message: str = "not found", code: int = 404, data: dict | None = None
    ):
        super().__init__(message, code, False, data=data)


class ConflictException(BaseAppException):
    """
    Exception raised for conflict errors.
    """

    def __init__(
        self, message: str = "conflict", code: int = 409, data: dict | None = None
    ):
        super().__init__(message, code, False, data=data)
