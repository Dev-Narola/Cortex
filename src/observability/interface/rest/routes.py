"""
Operational surface for the observability context.

Three endpoints:

* ``GET /health``      — liveness. "Is the process alive?"
* ``GET /health/ready`` — readiness. "Is the system able to
                              serve requests right now?" Checks
                              Postgres + Redis.
* ``GET /metrics``     — Prometheus exposition. Renders the
                          metrics registered in
                          :mod:`src.observability.infrastructure.metrics`.

The V3 era exposed ``/health`` as a tiny ``{"status": "ok"}``
endpoint mounted directly on the app. V4 keeps that contract
(so existing load-balancer probes don't break) but splits it
into the proper liveness vs. readiness distinction.

Why the split:

* A liveness probe that fails triggers a *restart* of the
  pod. Liveness must therefore *never* depend on external
  services — if Postgres is down, you don't want every pod
  to be restarted, because restarting won't fix Postgres.
* A readiness probe that fails removes the pod from the load
  balancer's rotation. It is fine for readiness to depend on
  Postgres / Redis — when they're down, this pod genuinely
  can't serve requests, and the LB should route elsewhere.

The implementation uses sync ``Session`` for the DB check
because the readiness probe is on the hot path; the cost of
async there outweighs the benefit (a 5-10ms check that returns
"ready" or "503" is fine).
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Request, Response, status
from fastapi.responses import JSONResponse, Response as FastAPIResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from src.observability.infrastructure.metrics import render_latest

logger = logging.getLogger(__name__)

router = APIRouter(tags=["observability"])


# --- /health (liveness) ---------------------------------------------------


@router.get(
    "/health",
    summary="Liveness probe — returns 200 if the process is up",
)
def health() -> dict[str, str]:
    """
    Always returns 200 with ``{"status": "ok"}`` so long as the
    Python process can run this function.

    Critical: do NOT call Postgres / Redis / the LLM provider
    here. A liveness probe must be cheap and self-contained;
    the load balancer will *restart* the pod if it ever fails,
    and restarting won't fix a broken Postgres.
    """
    return {"status": "ok"}


# --- /health/ready (readiness) --------------------------------------------


@router.get(
    "/health/ready",
    summary="Readiness probe — 200 only when Postgres + Redis are reachable",
    responses={
        200: {"description": "Ready"},
        503: {"description": "At least one dependency is unreachable"},
    },
)
async def health_ready(request: Request) -> FastAPIResponse:
    """
    Probe every dependency the request path actually needs.
    Returns 503 the moment one is down so the load balancer
    stops sending traffic.

    Currently checks:

    * Postgres (via the engine bound to ``request.app.state``
      if present, else a fresh ``Session`` from ``get_db``).
    * Redis (via the same singleton used by the embedding
      and search caches).

    Both checks are time-bounded: a stuck connection
    surfaces as a 503 within the same probe window, not as
    a hang. ``SELECT 1`` and ``PING`` are the cheapest
    possible round-trips.

    V4 dev fix — this handler is now ``async def`` so it
    can ``await`` the async Redis ping helper directly on
    the *FastAPI* event loop. The previous sync version
    used ``asyncio.run()`` to drive a *new* event loop,
    which broke ``redis.asyncio`` (the client is bound
    to the loop it was created on; running it on a
    different loop raises ``RuntimeError`` that the
    ``ping()`` helper swallowed as ``False``). The
    database check is sync; wrapping it in
    ``asyncio.to_thread`` keeps the event loop free
    even when Postgres is slow.
    """
    import asyncio

    checks: dict[str, str] = {}

    # --- Postgres -----------------------------------------------------
    def _check_postgres() -> None:
        from src.core.dependencies import get_db  # local import: avoid app cycles

        gen = get_db()
        session = next(gen)
        try:
            session.execute(text("SELECT 1"))
            checks["database"] = "ok"
        finally:
            try:
                next(gen)
            except StopIteration:
                pass

    try:
        await asyncio.to_thread(_check_postgres)
    except (SQLAlchemyError, Exception) as exc:  # noqa: BLE001
        checks["database"] = f"error: {type(exc).__name__}"
        logger.warning("readiness_check_failed", extra={"dependency": "database", "error": str(exc)})

    # --- Redis --------------------------------------------------------
    try:
        from src.core.redis_client import ping as redis_ping

        if await redis_ping():
            checks["redis"] = "ok"
        else:
            checks["redis"] = "error: ping_false"
            logger.warning("readiness_check_failed", extra={"dependency": "redis"})
    except Exception as exc:  # noqa: BLE001
        checks["redis"] = f"error: {type(exc).__name__}"
        logger.warning("readiness_check_failed", extra={"dependency": "redis", "error": str(exc)})

    healthy = all(v == "ok" for v in checks.values())
    body: dict[str, Any] = {
        "status": "ready" if healthy else "not_ready",
        "checks": checks,
    }
    code = status.HTTP_200_OK if healthy else status.HTTP_503_SERVICE_UNAVAILABLE
    return JSONResponse(status_code=code, content=body)


def asyncio_run_sync(awaitable: Any) -> Any:
    """
    Run a coroutine to completion from a sync context.

    Kept for any *other* call site that needs a sync
    bridge. The /health/ready route no longer uses it
    (see ``health_ready``) — the previous implementation
    created a new event loop per probe and broke the
    asyncio Redis client.
    """
    import asyncio

    try:
        return asyncio.run(awaitable)
    except Exception:  # noqa: BLE001 - readiness never raises
        return False


# --- /metrics (Prometheus exposition) -------------------------------------


@router.get(
    "/metrics",
    summary="Prometheus metrics exposition",
    response_class=Response,
)
def metrics() -> Response:
    """Render the V4 metrics registry in Prometheus text format.

    The response body is the standard
    ``Content-Type: text/plain; version=0.0.4`` exposition
    format consumed by Prometheus (and any compatible
    scraper).
    """
    payload, content_type = render_latest()
    return Response(content=payload, media_type=content_type)


__all__ = ["health", "health_ready", "metrics", "router"]
