import logging
from contextlib import asynccontextmanager
from time import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse

from .api import api_router, ws_router
from .observability.interface.rest.routes import router as health_router
from .core.config import settings
from .core.logging import configure_logging
from .core.middleware import (
    LoggingMiddleware,
    TracingMiddleware,
)
from .core.redis_client import close_redis, init_redis
from .observability.infrastructure.otel import (
    configure_tracing,
    shutdown_tracing,
)
from .shared.exceptions import (
    BaseAppException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
    UnauthorizedException,
    ValidationException,
)

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- V4: Boot-time observability setup ---------------
    # Configure structlog first so the subsequent
    # ``logger.info(...)`` calls render as JSON. The
    # function is idempotent — safe to call here even
    # though ``logging.basicConfig`` already installed a
    # stdlib handler above; the function will replace the
    # root handler list.
    configure_logging()
    # Install the OpenTelemetry tracer provider + the
    # standard auto-instrumentors (SQLAlchemy, Redis,
    # HTTPX). ``component="api"`` is the value that ends
    # up in the ``service.name`` resource attribute.
    configure_tracing(component="api")

    start_time = time()
    logger.info("Starting up the application...")
    await init_redis()
    try:
        yield
    finally:
        await close_redis()
        # Flush any buffered spans before the process
        # exits so the last batch of traces isn't lost.
        shutdown_tracing()
        end_time = time()
        logger.info(
            "Shutting down the application... Total uptime: %.2f seconds",
            end_time - start_time,
        )


app = FastAPI(
    debug=settings.DEBUG,
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=settings.APP_DESCRIPTION,
    lifespan=lifespan,
)

# V5 — restrict CORS, trusted hosts, and proxy header trust to
# values that come from the settings object. Production
# deployments MUST set:
#   TRUSTED_HOSTS  (comma-separated real hostnames, NOT "*")
#   CORS_ALLOWED_ORIGINS (the public origin(s) allowed to call
#                          the API, NOT "*" in production)
# The dev defaults of "*" remain so the local docker-compose
# stack keeps working without environment overrides.
def _split_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


_trusted_hosts = _split_csv(settings.TRUSTED_HOSTS) or ["*"]
app.add_middleware(TrustedHostMiddleware, allowed_hosts=_trusted_hosts)

# When the app sits behind nginx + ALB (the V5 layout), we need
# to translate ``X-Forwarded-Proto`` and ``X-Forwarded-For``
# into the request scope so downstream code sees the real client
# IP / scheme. The middleware is restricted to the private-
# network CIDRs in ``settings.TRUSTED_PROXY_CIDRS`` so a malicious
# client cannot spoof forwarded headers by sending them itself.
#
# Starlette >= 1.0 removed the built-in ``ProxyHeadersMiddleware``;
# the in-tree re-implementation in :mod:`src.core.middleware` is
# the dependency-free replacement. Behaviour is identical to the
# removed upstream version.
if settings.BEHIND_PROXY:
    from src.core.middleware import ProxyHeadersMiddleware

    _trusted_proxies = _split_csv(settings.TRUSTED_PROXY_CIDRS) or ["127.0.0.1"]
    app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=_trusted_proxies)

_cors_origins = _split_csv(settings.CORS_ALLOWED_ORIGINS) or ["*"]
_cors_methods = _split_csv(settings.CORS_ALLOW_METHODS) or ["*"]
_cors_headers = _split_csv(settings.CORS_ALLOW_HEADERS) or ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=_cors_methods,
    allow_headers=_cors_headers,
)

# --- V4: request-level observability middlewares ---
# ``TracingMiddleware`` wraps each request in an OpenTelemetry
# server span so the trace tree (HTTP → application → DB → Redis
# → LLM) is queryable end-to-end. ``LoggingMiddleware``
# generates / propagates the ``X-Request-ID`` and binds it to
# the per-request log context so every log line carries the
# same id.
#
# Starlette runs the *last* added middleware *first*, so
# ``TracingMiddleware`` ends up as the outermost layer (so
# its span encloses the whole request, including the work
# ``LoggingMiddleware`` does). Both are best-effort: a
# failure in either never breaks the request.
app.add_middleware(LoggingMiddleware)
app.add_middleware(TracingMiddleware)


# ---------------------------------------------------------------------------
# Exception handlers — translate domain exceptions to structured HTTP
# responses. Registered before routers so they take precedence over
# the catch-all `Exception` handler below.
# ---------------------------------------------------------------------------


def _error_payload(exc: BaseAppException) -> dict:
    return {
        "code": exc.code,
        "message": exc.message,
        "data": exc.data or {},
    }


@app.exception_handler(ValidationException)
async def _validation_handler(_: Request, exc: ValidationException) -> JSONResponse:
    return JSONResponse(status_code=exc.code, content=_error_payload(exc))


@app.exception_handler(UnauthorizedException)
async def _unauthorized_handler(_: Request, exc: UnauthorizedException) -> JSONResponse:
    return JSONResponse(status_code=exc.code, content=_error_payload(exc))


@app.exception_handler(ForbiddenException)
async def _forbidden_handler(_: Request, exc: ForbiddenException) -> JSONResponse:
    return JSONResponse(status_code=exc.code, content=_error_payload(exc))


@app.exception_handler(ConflictException)
async def _conflict_handler(_: Request, exc: ConflictException) -> JSONResponse:
    return JSONResponse(status_code=exc.code, content=_error_payload(exc))


@app.exception_handler(NotFoundException)
async def _not_found_handler(_: Request, exc: NotFoundException) -> JSONResponse:
    return JSONResponse(status_code=exc.code, content=_error_payload(exc))


@app.get("/")
async def root():
    return {"message": "Welcome to Cortex API"}


app.include_router(health_router)
app.include_router(api_router, prefix=settings.API_V1_PREFIX, tags=["API"])
app.include_router(ws_router)

# V7: Knowledge Graph GraphQL endpoint (/graphql)
from src.knowledge_graph.interface.graphql.schema import graphql_router
app.include_router(graphql_router, prefix="/graphql", tags=["GraphQL"])

# V8: MCP WebSocket endpoint (/ws/mcp)
from src.mcp.interface.websocket.routes import router as mcp_ws_router
app.include_router(mcp_ws_router)


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error("Unhandled exception: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"code": 500, "message": "Internal Server Error", "data": None},
    )

