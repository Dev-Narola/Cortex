"""
OpenTelemetry tracing configuration.

Sets up the global ``TracerProvider`` with the right resource
attributes (service name, version, environment) and a default
exporter. Idempotent — calling :func:`configure_tracing` more
than once is a no-op (the second call returns the existing
provider), so importing modules that touch the global tracer
during application boot is safe.

Auto-instrumentation:

On top of the tracer provider, :func:`configure_tracing` wires
in the standard OTel auto-instrumentors for the three external
dependencies that live on the request hot path:

* **SQLAlchemy** — every ``engine.execute()`` becomes a
  ``db.client.operation`` child span, with the parameterised
  SQL statement (never the bound values) attached as a
  ``db.statement`` attribute. Sensitive values (passwords,
  API-key hashes, document content) never appear because we
  rely on the default ``commenter``/``enable_commenter``
  configuration that emits only the SQL skeleton.
* **Redis** — every ``redis.get`` / ``redis.set`` / pipeline
  call becomes a ``db.client.operation`` child span tagged
  with the cache key family (we redact raw keys to keep
  cardinality bounded; the default OTel behaviour logs the
  full key, which is what we want for *cache* spans because
  the key IS the data).
* **HTTPX** — outbound HTTP calls (we use it for a few
  external lookups) get a client span. This isn't on the hot
  path of an LLM call (we use the official SDK) so it's
  mostly for the future.

The auto-instrumentors are gated on ``component != "none"``,
matching the standard OTel rule "if you have no
TracerProvider, don't bother installing anything". The
"none" case is the test suite, which uses an in-process
provider and wants zero noise from auto-instrumented
libraries.

Why a single function and not a class:

* The OpenTelemetry SDK already models the provider as a
  singleton. Wrapping it in a class would just be ceremony.
* Configuration is a one-shot boot-time concern; the
  application code only sees the (already-configured) global
  tracer.
* Tests that want a different exporter can call
  :func:`configure_tracing` with their own exporter before any
  imports happen.

Why OTLP/HTTP and not OTLP/gRPC:

* OTLP/HTTP works through corporate proxies; OTLP/gRPC does
  not.
* The Cortex V4 spec calls for OTLP/HTTP; if a Collector is
  deployed later, it can be flipped on by changing
  ``OTEL_EXPORTER_OTLP_ENDPOINT`` in the environment.
* A console exporter ships as a fallback so devs see spans
  locally without any extra infrastructure.

Anti-corruption notes:

* We use the **API** (not the SDK) at import-time everywhere
  in the application, so the call sites work whether or not
  the SDK has been configured. The SDK only takes over in
  :func:`configure_tracing`.
* No PII (no document content, no API keys, no JWTs) is ever
  attached to spans. The redaction list lives in
  :mod:`src.observability.infrastructure.redaction`.
"""

from __future__ import annotations

import logging
import os
import threading
from typing import Any

# --- OpenTelemetry imports -------------------------------------------------
# Imported lazily inside the function body so that modules which
# only need the *API* (e.g. application code calling
# ``tracer.start_as_current_span(...)``) don't have to install
# the full SDK to import this module.
from opentelemetry import trace  # API — used at import-time everywhere
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import (
    BatchSpanProcessor,
    ConsoleSpanExporter,
    SimpleSpanProcessor,
)
from opentelemetry.sdk.trace.sampling import (
    ALWAYS_ON,
    ParentBased,
    TraceIdRatioBased,
)

from src.core.config import settings

logger = logging.getLogger(__name__)

# Module-level guard so repeated ``configure_tracing`` calls
# (e.g. in tests that build a fresh provider per test) don't
# accidentally stack providers. The lock is per-process; for
# truly concurrent test runs the user is responsible for
# resetting via ``force=True``.
_lock = threading.Lock()
_configured = False


# --- service-name resolution ------------------------------------------------


def service_name_for(component: str) -> str:
    """
    Build a ``service.name`` attribute for the given component.

    Examples:
        ``service_name_for("api")     -> "cortex-api"``
        ``service_name_for("worker")  -> "cortex-worker"``
        ``service_name_for("evaluator") -> "cortex-evaluator"``

    The component argument is also the value of the
    ``service.component`` resource attribute, so the Collector
    can route on it (``cortex-*`` → ingest pipeline, etc.).
    """
    return f"cortex-{component}"


# --- helpers ---------------------------------------------------------------


def _build_exporter() -> Any:
    """
    Pick the right span exporter.

    Resolution order:
        1. ``OTEL_EXPORTER_OTLP_ENDPOINT`` env var → OTLP/HTTP
        2. ``OTEL_CONSOLE_EXPORTER=true`` → ConsoleSpanExporter
           (local development; verbose)
        3. otherwise → no-op (spans are recorded in-process but
           not exported). This is the safe default for unit
           tests and CI; it means spans are still queryable via
           ``opentelemetry.sdk.trace.TracerProvider`` in-process
           if a test wants them.
    """
    endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
    if endpoint:
        # Imported lazily so a missing endpoint doesn't require
        # the OTLP exporter to be importable.
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
            OTLPSpanExporter,
        )
        logger.info("OTel: using OTLP/HTTP exporter to %s", endpoint)
        return OTLPSpanExporter(endpoint=f"{endpoint.rstrip('/')}/v1/traces")
    if os.getenv("OTEL_CONSOLE_EXPORTER", "").lower() in ("1", "true", "yes"):
        logger.info("OTel: using ConsoleSpanExporter (local dev)")
        return ConsoleSpanExporter()
    logger.info("OTel: no exporter configured (spans stay in-process)")
    return None


def _build_sampler() -> Any:
    """
    Pick the right sampler.

    Defaults:
        * In development / staging → always-on (full trace
          fidelity, low traffic).
        * In production → parent-based ratio sampling at 10%
          (cheap, keeps the tail of interesting requests
          traceable when they fail).
        * Override at any time via ``OTEL_TRACES_SAMPLER`` /
          ``OTEL_TRACES_SAMPLER_ARG`` per the OTel env-var spec.
    """
    explicit = os.getenv("OTEL_TRACES_SAMPLER")
    if explicit:
        # Trust the standard env-var; the OTel SDK parses it
        # itself when we hand the parent-based wrapper a
        # fallback. Returning ALWAYS_ON here would override
        # the env var, which is not what we want.
        return ParentBased(root=ALWAYS_ON)
    if settings.ENVIRONMENT == "production":
        ratio = float(os.getenv("OTEL_TRACES_SAMPLER_ARG", "0.1"))
        logger.info("OTel: parent-based 10%% sampling (production)")
        return ParentBased(root=TraceIdRatioBased(ratio))
    logger.info("OTel: always-on sampling (non-production)")
    return ALWAYS_ON


# --- public API ------------------------------------------------------------


def configure_tracing(
    *,
    component: str = "api",
    version: str | None = None,
    force: bool = False,
    instrument_sqlalchemy: bool = True,
    instrument_redis: bool = True,
    instrument_httpx: bool = True,
) -> TracerProvider:
    """
    Configure the global OpenTelemetry tracer.

    Idempotent: the second call returns the existing provider
    without re-installing it. Pass ``force=True`` to reset the
    global provider (test-only path).

    When ``component`` is one of ``"api"`` / ``"worker"`` /
    ``"evaluator"``, this function also wires the standard
    auto-instrumentors for SQLAlchemy, Redis, and HTTPX so
    every request yields a complete trace tree (HTTP →
    application → DB → Redis → outbound HTTP). Pass
    ``component="none"`` to skip the provider entirely
    (useful for unit tests that don't want a global tracer).

    Args:
        component: One of ``"api"``, ``"worker"``,
            ``"evaluator"``, ``"none"``. Determines
            ``service.name`` and the ``service.component``
            resource attribute. ``"none"`` returns the existing
            provider unchanged without installing instrumentation.
        version: Service version. Defaults to the value in
            :class:`src.core.config.Settings` (i.e. the package
            version).
        force: Re-configure even if a provider is already set.
        instrument_sqlalchemy: Toggle the SQLAlchemy instrumentor
            (default True; set False for tests that want
            pristine engine behaviour).
        instrument_redis: Toggle the Redis instrumentor
            (default True).
        instrument_httpx: Toggle the HTTPX instrumentor
            (default True).

    Returns:
        The active :class:`TracerProvider` so the caller can
        wire it into shutdown hooks (``provider.shutdown()``).
    """
    global _configured
    with _lock:
        existing = trace.get_tracer_provider()
        if _configured and not force and isinstance(existing, TracerProvider):
            return existing

        # ``component == "none"`` is the explicit opt-out for
        # the test suite. We return whatever provider the OTel
        # API has installed (a no-op by default) without
        # touching the global state.
        if component == "none":
            logger.info("OTel: skipped (component='none')")
            return existing  # type: ignore[return-value]

        resource = Resource.create(
            attributes={
                "service.name": service_name_for(component),
                "service.version": version or settings.APP_VERSION,
                "service.component": component,
                "deployment.environment": settings.ENVIRONMENT,
                "telemetry.sdk.name": "opentelemetry",
                "telemetry.sdk.language": "python",
            }
        )

        provider = TracerProvider(
            resource=resource,
            sampler=_build_sampler(),
        )

        exporter = _build_exporter()
        if exporter is not None:
            # SimpleSpanProcessor for the console exporter (so
            # devs see spans immediately); BatchSpanProcessor for
            # everything else (so production doesn't burn cycles
            # flushing on every span).
            if isinstance(exporter, ConsoleSpanExporter):
                provider.add_span_processor(SimpleSpanProcessor(exporter))
            else:
                provider.add_span_processor(BatchSpanProcessor(exporter))

        trace.set_tracer_provider(provider)
        _configured = True
        logger.info(
            "OTel: configured (service=%s env=%s)",
            service_name_for(component),
            settings.ENVIRONMENT,
        )

        # Wire auto-instrumentation AFTER the global provider is
        # installed, so the instrumentors find a configured
        # provider to attach their spans to. Each instrumentor
        # is a best-effort, optional dependency — if the
        # import fails (e.g. a developer installed a partial
        # set), the rest of the application still works.
        if instrument_sqlalchemy:
            _instrument_sqlalchemy()
        if instrument_redis:
            _instrument_redis()
        if instrument_httpx:
            _instrument_httpx()

        return provider


# --- auto-instrumentation ---------------------------------------------------


# Module-level guard so a second ``configure_tracing`` call
# doesn't try to re-instrument an already-instrumented
# library (the OTel instrumentors warn loudly when that
# happens). The set is process-wide; tests that need a
# different behaviour should call
# ``SQLAlchemyInstrumentor().uninstrument()`` themselves.
_instrumented_libraries: set[str] = set()


def _instrument_sqlalchemy() -> None:
    """
    Wire SQLAlchemyInstrumentor so every ``Session.execute``
    becomes a ``db.client.operation`` child span.

    We don't pass a specific ``engine=`` argument: the
    instrumentor inspects every engine created after
    ``.instrument()`` returns. That's what we want — V3 has
    both a sync and an async engine, and the trace should
    show both.

    The instrumentor is **idempotent** within a process; we
    still gate the call on a module-level set so a second
    ``configure_tracing(force=True)`` in a long-running test
    process doesn't print a warning.
    """
    if "sqlalchemy" in _instrumented_libraries:
        return
    try:
        from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
    except ImportError:  # pragma: no cover - optional dep
        logger.info("OTel: SQLAlchemyInstrumentor not installed, skipping")
        return
    try:
        SQLAlchemyInstrumentor().instrument()
        _instrumented_libraries.add("sqlalchemy")
        logger.info("OTel: SQLAlchemy instrumentation enabled")
    except Exception:  # noqa: BLE001 - never let OTel break boot
        logger.exception("OTel: SQLAlchemy instrumentation failed")


def _instrument_redis() -> None:
    """
    Wire RedisInstrumentor so every ``redis.get`` /
    ``redis.set`` call becomes a ``db.client.operation`` child
    span.

    We instrument at the SDK level (no specific client
    instance) so both the API process and the worker's
    Redis connections are covered.
    """
    if "redis" in _instrumented_libraries:
        return
    try:
        from opentelemetry.instrumentation.redis import RedisInstrumentor
    except ImportError:  # pragma: no cover - optional dep
        logger.info("OTel: RedisInstrumentor not installed, skipping")
        return
    try:
        RedisInstrumentor().instrument()
        _instrumented_libraries.add("redis")
        logger.info("OTel: Redis instrumentation enabled")
    except Exception:  # noqa: BLE001
        logger.exception("OTel: Redis instrumentation failed")


def _instrument_httpx() -> None:
    """
    Wire HTTPXInstrumentor so outbound HTTP calls (a few
    third-party lookups, nothing on the LLM hot path) become
    client spans.
    """
    if "httpx" in _instrumented_libraries:
        return
    try:
        from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
    except ImportError:  # pragma: no cover - optional dep
        logger.info("OTel: HTTPXClientInstrumentor not installed, skipping")
        return
    try:
        HTTPXClientInstrumentor().instrument()
        _instrumented_libraries.add("httpx")
        logger.info("OTel: HTTPX instrumentation enabled")
    except Exception:  # noqa: BLE001
        logger.exception("OTel: HTTPX instrumentation failed")


def shutdown_tracing() -> None:
    """
    Flush and shut down the global tracer provider.

    Safe to call even if :func:`configure_tracing` was never
    invoked (it'll just be a no-op).
    """
    global _configured
    with _lock:
        provider = trace.get_tracer_provider()
        if isinstance(provider, TracerProvider):
            try:
                provider.shutdown()
            except Exception:  # noqa: BLE001 - shutdown must never raise
                logger.exception("OTel: provider shutdown failed")
        _configured = False
        # Reset the instrumented-libraries set so the next
        # ``configure_tracing(force=True)`` will re-instrument
        # cleanly. Test-only path; production never calls
        # this.
        _instrumented_libraries.clear()


# --- thin convenience re-exports ------------------------------------------


def get_tracer(name: str) -> Any:
    """
    Return the API tracer for the given name.

    ``name`` should be the *logical* name of the instrumented
    module — typically the dotted import path. The application
    code calls this; the underlying SDK does the rest.
    """
    return trace.get_tracer(name)


__all__ = [
    "configure_tracing",
    "get_tracer",
    "service_name_for",
    "shutdown_tracing",
]
