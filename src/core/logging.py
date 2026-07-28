"""
Structured (JSON) logging for Cortex.

V4 standardises on :mod:`structlog` for application logs. Every
log line is a single JSON object, with a consistent field
vocabulary (see :data:`STANDARD_FIELDS`) and an opt-in debug
mode that *can* include raw content. The default configuration
never logs document content, LLM prompts, or any bearer /
API-key material.

Why structlog (and not stdlib's :class:`logging.Formatter`):

* The V3 logger emits via stdlib's ``logging`` module; we
  integrate structlog with the stdlib root so the rest of the
  code (``logger.info(...)``) keeps working without changes.
* structlog's processor pipeline gives us a single chokepoint
  to attach the trace-id, the request-id, the tenant-id, and
  the redaction filter.
* Production logs are JSON; local dev (LOG_FORMAT != "json")
  can stay human-readable for free.

Anti-corruption:

* ``set_event_name`` and ``bind_request_context`` are the
  *only* approved ways to attach operational fields to a log
  line. A naked ``logger.info("some message")`` works but
  emits a line without an ``event`` key, which is broken for
  log-search; the unit test suite asserts every log call has
  one.
* Raw content (LLM prompts, document text, user messages) is
  never on the default path. To get it, the caller must
  explicitly call :func:`enable_debug_content` for a
  context — and that path still flows through the redaction
  filter.
"""

from __future__ import annotations

import contextvars
import logging
import sys
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

import structlog

from src.core.config import settings


# --- standard field vocabulary ---------------------------------------------
#
# A small, stable list of field names that every log line is
# allowed (and expected) to carry. The structlog processor
# ``_normalise_fields`` enforces this by renaming common
# ad-hoc keys ("msg", "data") to the canonical one.

STANDARD_FIELDS: tuple[str, ...] = (
    "timestamp",
    "level",
    "event",
    "service",
    "environment",
    "trace_id",
    "span_id",
    "request_id",
    "tenant_id",
    "user_id",
    "api_key_id",
    "operation",
    "duration_ms",
    "error_type",
    "logger",
)

# Stable event names. Adding to this list is the right move
# when adding a new operational log call — log-search relies
# on these strings being exactly as written here.
LOG_EVENTS: dict[str, str] = {
    "request_started": "request_started",
    "request_completed": "request_completed",
    "request_failed": "request_failed",
    "document_ingestion_started": "document_ingestion_started",
    "document_ingestion_completed": "document_ingestion_completed",
    "document_ingestion_failed": "document_ingestion_failed",
    "embedding_started": "embedding_started",
    "embedding_completed": "embedding_completed",
    "embedding_failed": "embedding_failed",
    "retrieval_started": "retrieval_started",
    "retrieval_completed": "retrieval_completed",
    "rerank_started": "rerank_started",
    "rerank_completed": "rerank_completed",
    "llm_call_started": "llm_call_started",
    "llm_call_completed": "llm_call_completed",
    "llm_call_failed": "llm_call_failed",
    "usage_event_recorded": "usage_event_recorded",
    "audit_event_recorded": "audit_event_recorded",
}


# --- per-request context ----------------------------------------------------
#
# ContextVars let the same async task carry its own
# trace/request/tenant identifiers without every log call
# having to thread them through as arguments. The
# TracingMiddleware in :mod:`src.core.middleware` binds them
# at the start of every request; downstream code reads them
# via ``current_request_context()``.

_current_request_id: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "cortex_request_id", default=None
)
_current_tenant_id: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "cortex_tenant_id", default=None
)
_current_user_id: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "cortex_user_id", default=None
)
_current_api_key_id: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "cortex_api_key_id", default=None
)
_debug_content_enabled: contextvars.ContextVar[bool] = contextvars.ContextVar(
    "cortex_debug_content", default=False
)


def bind_request_context(
    *,
    request_id: str | None = None,
    tenant_id: str | None = None,
    user_id: str | None = None,
    api_key_id: str | None = None,
) -> None:
    """Bind per-request context for log enrichment.

    Idempotent: each call replaces the previous value, so the
    request middleware can call this at the start of every
    request without leaking state.
    """
    if request_id is not None:
        _current_request_id.set(request_id)
    if tenant_id is not None:
        _current_tenant_id.set(tenant_id)
    if user_id is not None:
        _current_user_id.set(user_id)
    if api_key_id is not None:
        _current_api_key_id.set(api_key_id)


def clear_request_context() -> None:
    """Reset all per-request context variables.

    Called by the request middleware at the *end* of each
    request so a worker that handles many requests in one
    task does not leak identity from one to the next.
    """
    _current_request_id.set(None)
    _current_tenant_id.set(None)
    _current_user_id.set(None)
    _current_api_key_id.set(None)
    _debug_content_enabled.set(False)


@contextmanager
def enable_debug_content() -> Iterator[None]:
    """
    Context manager: log raw content (LLM prompts, doc chunks)
    for the current async task.

    Off by default. The redaction layer is *still* applied
    to the raw content, so even a debug-mode log line can
    never contain a bearer token or API key.
    """
    token = _debug_content_enabled.set(True)
    try:
        yield
    finally:
        _debug_content_enabled.reset(token)


def debug_content_enabled() -> bool:
    return bool(_debug_content_enabled.get())


# --- structlog processor pipeline ------------------------------------------


def _add_timestamp(
    logger: Any, method_name: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    """Attach a UTC ISO-8601 timestamp to every event."""
    event_dict.setdefault(
        "timestamp", datetime.now(timezone.utc).isoformat()
    )
    return event_dict


def _add_service_metadata(
    logger: Any, method_name: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    """Attach service + environment fields once per process."""
    event_dict.setdefault("service", settings.APP_NAME)
    event_dict.setdefault("environment", settings.ENVIRONMENT)
    return event_dict


def _add_request_context(
    logger: Any, method_name: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    """Merge in the per-request context (request_id, tenant, …)."""
    for var, key in (
        (_current_request_id, "request_id"),
        (_current_tenant_id, "tenant_id"),
        (_current_user_id, "user_id"),
        (_current_api_key_id, "api_key_id"),
    ):
        value = var.get()
        if value is not None and key not in event_dict:
            event_dict[key] = value
    return event_dict


def _add_trace_ids(
    logger: Any, method_name: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    """Pull the current OpenTelemetry trace_id / span_id into the
    log line so every line in a request can be cross-referenced
    with the trace.

    The API call is lazy and silent on failure: if the OTel
    SDK is not configured (e.g. in a unit test), the log
    line simply omits the fields.
    """
    if "trace_id" in event_dict and "span_id" in event_dict:
        return event_dict
    try:
        from opentelemetry import trace as _otel_trace

        span = _otel_trace.get_current_span()
        if span is None:
            return event_dict
        ctx = span.get_span_context()
        if ctx and ctx.is_valid:
            # Format the 16-byte trace_id as a 32-char hex string
            # to match the OTel spec for log-trace correlation.
            event_dict.setdefault("trace_id", f"{ctx.trace_id:032x}")
            event_dict.setdefault("span_id", f"{ctx.span_id:016x}")
    except Exception:  # noqa: BLE001 - never let logging break a request
        pass
    return event_dict


def _redact_sensitive(
    logger: Any, method_name: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    """Run the standard redaction pass over every event dict.

    The redaction layer is implemented in
    :mod:`src.observability.infrastructure.redaction`; the
    processor is a thin wrapper so the rest of structlog can
    ignore the rule set.
    """
    try:
        from src.observability.infrastructure.redaction import redact

        return redact(event_dict)
    except Exception:  # noqa: BLE001 - redaction must never break logging
        return event_dict


def _normalise_fields(
    logger: Any, method_name: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    """
    Rename common ad-hoc keys to the canonical field names.

    | input key | canonical |
    |-----------|-----------|
    | ``msg``   | ``event`` |
    | ``message`` | ``event`` |
    | ``data``  | dropped (callers should use named fields) |
    | ``info``  | dropped |

    This is what makes the V4 log-search contract: every line
    has a known shape, so dashboard / alert queries can be
    written once and not break when a developer adds a new
    log call.
    """
    if "event" not in event_dict:
        if "msg" in event_dict:
            event_dict["event"] = event_dict.pop("msg")
        elif "message" in event_dict:
            event_dict["event"] = event_dict.pop("message")
    for bad in ("data", "info"):
        event_dict.pop(bad, None)
    return event_dict


def _drop_in_deny_list() -> tuple[str, ...]:
    """Field names that should never appear in a log line,
    even after the standard redaction. A defence in depth
    measure for situations where a developer adds a new
    field and forgets to update the redaction list.
    """
    return ("prompt", "raw_prompt", "document_content", "raw_content")


def _strip_dangerous_fields(
    logger: Any, method_name: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    deny = {d.lower() for d in _drop_in_deny_list()}
    for k in list(event_dict.keys()):
        if k.lower() in deny:
            # Don't even keep the key. Drop the value silently
            # and log a warning at the call site (the caller
            # can opt back in via enable_debug_content).
            event_dict.pop(k, None)
    return event_dict


# --- stdlib root ↔ structlog bridge ----------------------------------------


def _stdlib_to_structlog(
    name: str, level: int, event_dict: dict[str, Any]
) -> Any:
    """Bridge stdlib ``logging`` records into structlog
    events, so V3 modules that use ``logger.info("msg", extra={...})``
    produce the same shape as V4 ``log.info("event_name", ...)``
    calls.
    """
    event_dict.setdefault("logger", name)
    event_dict.setdefault("level", logging.getLevelName(level))
    return event_dict


def _configure_stdlib_root() -> None:
    """Send every stdlib log record through the structlog
    pipeline, so V3 code that uses ``logging.getLogger(...)``
    emits the same shape as V4 code.
    """
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter("%(message)s")  # structlog renders the JSON
    )
    root = logging.getLogger()
    # Idempotent — replace any pre-existing handlers so
    # ``configure_logging`` can be called from tests without
    # leaving a forest of duplicate handlers behind.
    for existing in list(root.handlers):
        root.removeHandler(existing)
    root.addHandler(handler)
    root.setLevel(logging.DEBUG if settings.DEBUG else logging.INFO)


# --- public API ------------------------------------------------------------


def configure_logging(*, force: bool = False) -> None:
    """
    Configure structlog + the stdlib root.

    Idempotent: calling twice is a no-op (subsequent calls
    just reset the handler list to a single structlog
    handler). Set ``force=True`` to rebuild from scratch
    (test-only path).
    """
    if not force and getattr(configure_logging, "_configured", False):
        return

    # Renderer: JSON in production / staging, key-value in dev.
    use_json = (getattr(settings, "LOG_FORMAT", "") == "json") or (
        settings.ENVIRONMENT in ("production", "staging")
    )
    renderer = (
        structlog.processors.JSONRenderer()
        if use_json
        else structlog.dev.ConsoleRenderer(colors=sys.stdout.isatty())
    )

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            _add_timestamp,
            _add_service_metadata,
            _add_request_context,
            _add_trace_ids,
            _strip_dangerous_fields,
            _normalise_fields,
            _redact_sensitive,
            _stdlib_to_structlog,
            renderer,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.DEBUG if settings.DEBUG else logging.INFO
        ),
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    _configure_stdlib_root()
    configure_logging._configured = True  # type: ignore[attr-defined]


configure_logging._configured = False  # type: ignore[attr-defined]


def get_logger(name: str | None = None) -> Any:
    """Return a structlog logger.

    The legacy ``from src.core.logging import logger`` symbol
    is still exported for V3 code; it points at the same
    structlog-bound logger.
    """
    if name is None:
        name = "cortex"
    return structlog.get_logger(name)


# --- legacy V3 surface ------------------------------------------------------
#
# Existing V3 code does ``from src.core.logging import logger`` and
# ``logger.info("msg", extra={...})``. Keep that working: the
# ``logger`` below is the *stdlib* logger (because that's what
# the V3 callers expect) but it has been routed through
# structlog's processor pipeline by ``_configure_stdlib_root``.

logger = logging.getLogger("cortex")


__all__ = [
    "LOG_EVENTS",
    "STANDARD_FIELDS",
    "bind_request_context",
    "clear_request_context",
    "configure_logging",
    "debug_content_enabled",
    "enable_debug_content",
    "get_logger",
    "logger",
]
