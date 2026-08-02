"""
Per-tenant rate limiting service.

The :class:`RateLimiter` enforces three independent caps
per tenant, all backed by Redis (the spec is explicit on
"using Redis"):

* **requests per minute** — a sliding window of API calls.
  The default cap is 60; the platform default for a fresh
  tenant is the same.
* **monthly token budget** — the total LLM tokens a
  tenant can consume in a calendar month. The default is
  1,000,000; the operator can raise it per-tenant.
* **agent executions per hour** — the rate at which a
  tenant can *start* an ``AgentRun``. Distinct from the
  API cap because an agent run is expensive and
  long-lived; a tenant may want a tight API rate but a
  more generous agent budget.

The :class:`RateLimiter` is a thin Redis wrapper. The
counters live in Redis because:

* Redis is already a project dependency (the worker
  broker, the cache),
* the counters are inherently short-lived (a sliding
  window, a TTL),
* Redis operations are atomic, so a concurrent burst
  does not race.

The caps themselves live in the
:class:`~src.limits.infrastructure.models.TenantLimitsModel`
table. A tenant that does not have a row has the platform
defaults (60 / 1,000,000 / 100). A row is created on
demand the first time a tenant hits a limit and the
service decides to persist a custom value.

This module is the only place that knows the Redis key
layout for the rate limiter. The keys are:

* ``cortex:rl:rpm:{tenant_id}`` — sliding-window count of
  API calls in the last 60 s.
* ``cortex:rl:tokens:{tenant_id}:{YYYY-MM}`` — cumulative
  LLM tokens consumed in the current calendar month.
* ``cortex:rl:agent:{tenant_id}`` — sliding-window count
  of agent executions in the last hour.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Protocol
from uuid import UUID

from src.limits.infrastructure.models import TenantLimitsModel

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class RateLimitExceeded(Exception):
    """Raised by :class:`RateLimiter` when a cap is hit.

    The route handler catches this and returns a
    429 with the offending cap name and the current
    counter. Distinct from the project-wide
    :class:`src.shared.exceptions.BaseAppException` so
    the rate-limit response shape is dedicated — the
    spec calls for the response to include a
    ``Retry-After`` header (computed from the sliding
    window), which a generic exception does not carry.
    """

    def __init__(
        self,
        *,
        kind: str,
        limit: int,
        current: int,
        retry_after_seconds: int,
        tenant_id: str,
    ) -> None:
        self.kind = kind
        self.limit = limit
        self.current = current
        self.retry_after_seconds = retry_after_seconds
        self.tenant_id = tenant_id
        super().__init__(
            f"rate limit '{kind}' exceeded for tenant {tenant_id}: "
            f"{current}/{limit} (retry in {retry_after_seconds}s)"
        )


# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class PlatformDefaults:
    """Per-tenant rate limit defaults for a fresh tenant.

    Operators override these per-tenant via the
    ``tenant_limits`` table; the rate limiter falls
    back to these constants when no row exists.
    """

    requests_per_minute: int = 60
    token_limit: int = 1_000_000
    agent_execution_limit: int = 100


# ---------------------------------------------------------------------------
# Redis client protocol
# ---------------------------------------------------------------------------


class RedisLike(Protocol):
    """The minimum surface the rate limiter needs from Redis.

    A :class:`Protocol` rather than a concrete type so
    the rate limiter is testable with an in-memory
    stub. The production wiring goes through
    :func:`src.core.redis_client.get_redis` which returns
    an ``redis.asyncio.Redis`` instance — its API
    matches this surface.
    """

    async def incr(self, name: str) -> int: ...
    async def incrby(self, name: str, amount: int) -> int: ...
    async def expire(self, name: str, time: int) -> bool: ...
    async def get(self, name: str) -> "bytes | str | None": ...
    async def set(self, name: str, value: "int | str | bytes", ex: int | None = None) -> "bool | None": ...


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class RateLimiter:
    """Per-tenant rate limiter backed by Redis.

    The class is intentionally a single object with one
    per-cap method (``check_rpm``, ``check_tokens``,
    ``check_agent_execution``) so the route handler can
    call exactly the cap it cares about. A combined
    ``enforce_all`` is also exposed for the agent
    execute endpoint, which checks all three caps in
    one go.
    """

    # Redis key prefix. Single source of truth so a
    # future migration to a different key namespace is
    # a one-line change.
    KEY_PREFIX = "cortex:rl"

    def __init__(
        self,
        redis: RedisLike,
        *,
        defaults: PlatformDefaults | None = None,
    ) -> None:
        self._redis = redis
        self._defaults = defaults or PlatformDefaults()

    # ----- cap lookup -------------------------------------------------------

    async def get_limits(
        self,
        *,
        tenant_id: UUID,
        session: "Session | None" = None,
    ) -> tuple[int, int, int]:
        """Return the (requests_per_minute, token_limit, agent_execution_limit) for a tenant.

        If ``session`` is provided and a row exists, the
        row is returned. Otherwise the platform defaults
        are used. The session is read-only here; the
        caller is responsible for persisting any new
        cap.
        """
        if session is not None:
            row = (
                session.query(TenantLimitsModel)
                .filter(TenantLimitsModel.tenant_id == tenant_id)
                .one_or_none()
            )
            if row is not None:
                return (
                    row.requests_per_minute,
                    row.token_limit,
                    row.agent_execution_limit,
                )
        return (
            self._defaults.requests_per_minute,
            self._defaults.token_limit,
            self._defaults.agent_execution_limit,
        )

    # ----- enforcement -----------------------------------------------------

    async def check_rpm(self, *, tenant_id: UUID, session: "Session | None" = None) -> None:
        """Increment the per-minute request counter; raise if over the cap.

        Uses a sliding 60-second window via a per-call
        ``EXPIRE`` (cheap, since it only fires on the
        first request in the window). The counter is
        monotonically incremented within the window;
        a true sliding window (sub-second resolution)
        would use a sorted set, but the per-minute cap
        doesn't need that precision and the simpler
        counter is correct for the cap.
        """
        cap, _, _ = await self.get_limits(tenant_id=tenant_id, session=session)
        if cap <= 0:
            return
        key = f"{self.KEY_PREFIX}:rpm:{tenant_id}"
        current = int(await self._redis.incr(key))
        if current == 1:
            # First request in this window — set the
            # TTL. ``EXPIRE`` is a no-op on subsequent
            # calls.
            await self._redis.expire(key, 60)
        if current > cap:
            retry = self._retry_after(key)
            raise RateLimitExceeded(
                kind="requests_per_minute",
                limit=cap,
                current=current,
                retry_after_seconds=retry,
                tenant_id=str(tenant_id),
            )

    async def check_tokens(
        self,
        *,
        tenant_id: UUID,
        tokens: int,
        session: "Session | None" = None,
    ) -> None:
        """Record ``tokens`` consumed by an LLM call; raise if over the monthly cap.

        Called by the agent loop and the conversation
        path after every LLM call. The counter is the
        cumulative token usage in the current calendar
        month; the key includes the month so the
        counter resets implicitly on the 1st.
        """
        if tokens <= 0:
            return
        # Tuple order from :meth:`get_limits` is
        # ``(requests_per_minute, token_limit, agent_execution_limit)``.
        # Unpack only the field this method needs.
        _, token_cap, _ = await self.get_limits(
            tenant_id=tenant_id, session=session
        )
        if token_cap <= 0:
            return
        month = datetime.now(UTC).strftime("%Y-%m")
        key = f"{self.KEY_PREFIX}:tokens:{tenant_id}:{month}"
        # ``INCRBY`` (not ``INCR``) — the token counter
        # is incremented by the number of tokens used
        # in the LLM call, not by one per call. The
        # RedisLike protocol needs an ``incrby`` method.
        current = int(await self._redis.incrby(key, int(tokens)))
        if current == int(tokens):
            # First write in this month — set a
            # generous TTL: 35 days, so the key
            # survives a month boundary long enough to
            # surface "you just went over" alerts
            # before the counter resets.
            await self._redis.expire(key, 35 * 24 * 60 * 60)
        if current > token_cap:
            raise RateLimitExceeded(
                kind="token_limit",
                limit=token_cap,
                current=current,
                retry_after_seconds=35 * 24 * 60 * 60,
                tenant_id=str(tenant_id),
            )

    async def check_agent_execution(
        self,
        *,
        tenant_id: UUID,
        session: "Session | None" = None,
    ) -> None:
        """Increment the per-hour agent-execution counter; raise if over the cap."""
        _, _, cap = await self.get_limits(tenant_id=tenant_id, session=session)
        if cap <= 0:
            return
        key = f"{self.KEY_PREFIX}:agent:{tenant_id}"
        current = int(await self._redis.incr(key))
        if current == 1:
            await self._redis.expire(key, 3600)
        if current > cap:
            retry = self._retry_after(key)
            raise RateLimitExceeded(
                kind="agent_execution_limit",
                limit=cap,
                current=current,
                retry_after_seconds=retry,
                tenant_id=str(tenant_id),
            )

    # ----- introspection ----------------------------------------------------

    async def current_usage(self, *, tenant_id: UUID) -> dict[str, int]:
        """Return the current counter values for a tenant. For diagnostics."""
        month = datetime.now(UTC).strftime("%Y-%m")
        return {
            "rpm": int((await self._redis.get(f"{self.KEY_PREFIX}:rpm:{tenant_id}")) or 0),
            "agent_hour": int((await self._redis.get(f"{self.KEY_PREFIX}:agent:{tenant_id}")) or 0),
            "tokens_month": int(
                (await self._redis.get(f"{self.KEY_PREFIX}:tokens:{tenant_id}:{month}")) or 0
            ),
        }

    # ----- helpers ----------------------------------------------------------

    def _retry_after(self, key: str) -> int:
        """Best-effort Retry-After in seconds.

        We don't want to call ``TTL`` on every
        increment (extra round trip), so we return a
        conservative upper bound for the window length
        based on the key prefix. The route handler can
        refine this with a synchronous ``TTL`` call if
        it cares about the exact value.
        """
        if "rpm" in key:
            return 60
        if "agent" in key:
            return 3600
        if "tokens" in key:
            return 35 * 24 * 60 * 60
        return 60


__all__ = [
    "PlatformDefaults",
    "RateLimitExceeded",
    "RateLimiter",
    "RedisLike",
]
