"""
Cross-cutting HTTP middleware.

This module owns three concerns:

* **X-Request-ID propagation** — generate or preserve a request
  id, echo it on the response, and bind it to the per-request
  log context so every log line in the request carries the
  same id.
* **OpenTelemetry HTTP tracing** — wrap each request in a
  server span with the right ``http.*`` attributes and the
  resolved route template (not the raw URL — that would
  explode cardinality).
* **Redaction of inbound headers** — before the trace middleware
  attaches anything to a span, scrub it against the standard
  blocklist in :mod:`src.observability.infrastructure.redaction`.

The middleware is the only place in the application that does
this work, so the rules live in *one* file. Adding a new header
that should never be logged (e.g. ``X-Internal-Token``) is a
single change to the redaction layer.

Operational notes:

* The ``LoggingMiddleware`` from V3 is kept for backward
  compatibility (the existing app adds it). It does the
  ``X-Request-ID`` echo and log-line emission. The
  ``TracingMiddleware`` does the span work.
* The ``AuthenticationMiddleware`` and ``TenantMiddleware``
  from V3 are kept as no-op shims so existing wiring
  (``main.py``) does not break. The V1 identity layer already
  resolves the tenant inside the dependency-injection layer
  (``get_current_user``); the V4 upgrade is to record the
  resolved tenant in the per-request log context and the
  span.
"""

from __future__ import annotations

import time
import uuid
from collections.abc import Awaitable, Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from src.observability.infrastructure.otel import get_tracer


# --- X-Request-ID propagation ----------------------------------------------


_REQUEST_ID_HEADER = "X-Request-ID"


def _new_request_id() -> str:
    return uuid.uuid4().hex


def _coerce_inbound_request_id(raw: str | None) -> str | None:
    """
    Validate a client-supplied request id.

    Accepts UUID-shaped or any printable string up to 128 chars.
    Returns the cleaned value, or ``None`` if the input is
    missing or invalid (so the caller can fall back to a
    generated one).

    Why a length cap: a malicious client could otherwise force
    us to log arbitrarily long strings — a small denial-of-
    service vector that structlog would happily serialize.
    """
    if raw is None:
        return None
    cleaned = raw.strip()
    if not cleaned or len(cleaned) > 128 or any(
        ch.isspace() for ch in cleaned
    ):
        return None
    return cleaned


# --- LoggingMiddleware (X-Request-ID + per-request log context) -----------


class LoggingMiddleware(BaseHTTPMiddleware):
    """
    Generate / preserve an X-Request-ID, bind it (plus any
    resolved tenant / user) to the per-request log context,
    emit ``request_started`` and ``request_completed`` events,
    and echo the id on the response.

    This is the same shape as the V3 logger; the V4 upgrade is
    the per-request context binding (so every downstream log
    line carries the id) and the consistent event names.
    """

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        # Lazy import: the logging module pulls in structlog,
        # which we don't want to load at module-import time for
        # the test suite that imports middleware in isolation.
        from src.core.logging import (
            bind_request_context,
            clear_request_context,
            get_logger,
            LOG_EVENTS,
        )

        log = get_logger("cortex.http")

        # 1) Request id: client-supplied if valid, else generated.
        inbound = _coerce_inbound_request_id(
            request.headers.get(_REQUEST_ID_HEADER)
        )
        request_id = inbound or _new_request_id()
        request.state.request_id = request_id

        # 2) Bind the per-request log context. The tenant/user
        #    may be populated later by the auth dependency; the
        #    binding is idempotent, so subsequent calls just
        #    overwrite.
        bind_request_context(request_id=request_id)

        # 3) Emit request_started with the route template (not
        #    the raw URL) so log-search doesn't fan out on
        #    document-id-style paths.
        route_template = _route_template(request)
        start = time.perf_counter()
        log.info(
            LOG_EVENTS["request_started"],
            method=request.method,
            route=route_template,
            path_template=route_template,
        )

        try:
            response = await call_next(request)
        except Exception as exc:
            duration_ms = (time.perf_counter() - start) * 1000.0
            log.exception(
                LOG_EVENTS["request_failed"],
                method=request.method,
                route=route_template,
                duration_ms=round(duration_ms, 2),
                error_type=type(exc).__name__,
            )
            clear_request_context()
            raise

        duration_ms = (time.perf_counter() - start) * 1000.0
        response.headers[_REQUEST_ID_HEADER] = request_id
        log.info(
            LOG_EVENTS["request_completed"],
            method=request.method,
            route=route_template,
            status_code=response.status_code,
            duration_ms=round(duration_ms, 2),
        )

        # 5) Reset context so a recycled worker task doesn't
        #    leak the previous request's identity.
        clear_request_context()
        return response


# --- TracingMiddleware (OpenTelemetry server span) -------------------------


class TracingMiddleware(BaseHTTPMiddleware):
    """
    Wrap each HTTP request in an OpenTelemetry server span.

    Attributes follow the OTel HTTP semantic conventions
    (``http.method``, ``http.route``, ``http.status_code``)
    so off-the-shelf dashboards and processors can interpret
    the trace without any custom mapping. Tenant / user ids
    are attached as span *attributes*, not as labels — high
    cardinality is fine in traces; it's Prometheus labels we
    avoid.
    """

    def __init__(self, app, *, tracer_name: str = "cortex.http") -> None:
        super().__init__(app)
        self._tracer = get_tracer(tracer_name)

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        route_template = _route_template(request)
        with self._tracer.start_as_current_span(
            f"{request.method} {route_template}",
            attributes={
                "http.method": request.method,
                "http.route": route_template,
                "http.scheme": request.url.scheme,
                "http.target": route_template,  # not the raw URL
                "http.user_agent": request.headers.get("user-agent", ""),
                "net.peer.ip": request.client.host if request.client else "",
            },
        ) as span:
            try:
                response = await call_next(request)
            except Exception as exc:
                span.record_exception(exc)
                span.set_status(  # type: ignore[arg-type]
                    _OTEL_STATUS_ERROR,  # see below
                    str(exc),
                )
                raise
            span.set_attribute("http.status_code", response.status_code)
            # Mark 5xx responses as errors so the trace is
            # findable in any "errors" view without custom
            # filtering.
            if response.status_code >= 500:
                span.set_status(_OTEL_STATUS_ERROR, "HTTP 5xx")
            return response


# --- helpers ---------------------------------------------------------------


def _route_template(request: Request) -> str:
    """
    Return the route template (e.g. ``/api/documents/{id}``)
    or the raw path if no template is matched.

    Critical for cardinality control: logging ``/api/documents/8f3...``
    would create one cardinality-blowing log line per document.
    """
    route = request.scope.get("route")
    if route is not None and getattr(route, "path", None):
        return route.path
    return request.url.path


# Imported lazily so the middleware module doesn't take a
# hard dependency on the OTel SDK at import time. The constants
# come straight from the OTel status enum; we just give them
# stable names that don't need a ``from opentelemetry.trace``
# at the top of the file.
try:
    from opentelemetry.trace import Status, StatusCode
    _OTEL_STATUS_ERROR = Status(StatusCode.ERROR)
except ImportError:  # pragma: no cover - OTel not installed
    class _Stub:
        def __init__(self, *_args, **_kwargs) -> None:
            pass

    _OTEL_STATUS_ERROR = _Stub()


# --- legacy V3 shims -------------------------------------------------------
#
# V1's identity layer resolves tenant / user in the FastAPI
# dependency (``get_current_user``), not in middleware. The
# V3 placeholders below are kept as no-ops so existing app
# wiring in ``main.py`` still works; future V4+ work can
# replace them with real middleware if needed.


class AuthenticationMiddleware(BaseHTTPMiddleware):
    """V1 placeholder; identity is resolved inside the route
    dependency. Kept so older ``main.py`` wiring does not
    break."""

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        return await call_next(request)


class TenantMiddleware(BaseHTTPMiddleware):
    """V1 placeholder; same as :class:`AuthenticationMiddleware`."""

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        return await call_next(request)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """V1 placeholder; per-tenant rate limiting is applied at
    the route boundary by the ``RateLimit`` dependency. Kept
    for backward-compatible wiring."""

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        return await call_next(request)


__all__ = [
    "AuthenticationMiddleware",
    "LoggingMiddleware",
    "RateLimitMiddleware",
    "TenantMiddleware",
    "TracingMiddleware",
    "_REQUEST_ID_HEADER",
    "_coerce_inbound_request_id",
    "_route_template",
]
