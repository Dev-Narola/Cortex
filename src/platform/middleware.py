import time
import uuid
from collections.abc import Awaitable, Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from .logging import logger


class LoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware to log incoming requests and outgoing responses.
    """

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        # Generate a unique request ID
        request_id = str(uuid.uuid4())
        # Add request ID to request state for use in endpoints
        request.state.request_id = request_id

        # Log request
        start_time = time.time()
        logger.info(
            "Incoming request",
            extra={
                "request_id": request_id,
                "method": request.method,
                "url": str(request.url),
                "headers": dict(request.headers),
                "client": request.client.host if request.client else None,
            },
        )

        # Process request
        response: Response = await call_next(request)

        # Log response
        process_time = time.time() - start_time
        logger.info(
            "Outgoing response",
            extra={
                "request_id": request_id,
                "status_code": response.status_code,
                "process_time": f"{process_time:.4f}s",
            },
        )

        # Add request ID to response headers
        response.headers["X-Request-ID"] = request_id
        return response


class AuthenticationMiddleware(BaseHTTPMiddleware):
    """
    Placeholder for authentication middleware.
    To be implemented in V1.
    """

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        # TODO: Implement authentication logic
        return await call_next(request)


class TenantMiddleware(BaseHTTPMiddleware):
    """
    Placeholder for tenant resolution middleware.
    To be implemented in V1.
    """

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        # TODO: Extract tenant from request (e.g., subdomain, header)
        # and attach to request.state.tenant
        return await call_next(request)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Placeholder for rate limiting middleware.
    To be implemented in V1.
    """

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        # TODO: Implement rate limiting
        return await call_next(request)
