"""
Usage service — the application layer that records usage
events.

The flow is small but important: every embed / complete /
rerank call site in V3's adapters calls
:meth:`UsageService.record` with the inputs and outputs, and
the service:

1. looks up the cost via :class:`CostCalculator`,
2. constructs a :class:`UsageEvent`,
3. writes it via the repository,
4. increments the matching Prometheus counter so the
   dashboard knows immediately.

The service is the single chokepoint that knows "an LLM
call happened and is billable"; the V3 adapters never talk
to the repository or the cost calculator directly. That
keeps the billable-event taxonomy in one place and makes a
V5 swap (e.g. a real Stripe metering backend) a one-class
change.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Any

from src.billing.application.cost_calculator import CostCalculator
from src.billing.domain.entities import EventType, UnitType, UsageEvent
from src.billing.domain.ports import UsageEventRepository


logger = logging.getLogger(__name__)


class UsageRecordingError(Exception):
    """
    V4 Phase 14 — typed error raised by
    :meth:`UsageService.record` when ``strict=True`` and
    persistence fails.

    The caller (the V3 service) catches this, logs at
    ``CRITICAL``, and increments a Prometheus counter, but
    does not roll back the upstream LLM call (the call has
    already succeeded; rolling it back would leave the
    tenant without the answer they paid for).
    """

    def __init__(
        self,
        *,
        tenant_id: uuid.UUID,
        event_type: str,
        original: BaseException,
    ) -> None:
        super().__init__(
            f"Failed to record usage event for tenant={tenant_id} "
            f"event_type={event_type}: {original!r}"
        )
        self.tenant_id = tenant_id
        self.event_type = event_type
        self.original = original


@dataclass(frozen=True)
class UsageSummary:
    """A small read-model returned to API callers.

    The /tenants/me/usage endpoint serialises this. We keep
    it as a plain dataclass — no Pydantic — because it's
    internal to the application layer; the route's Pydantic
    schema is the public shape.
    """

    event_type: str
    unit_type: str
    units: float
    cost_usd: float


class UsageService:
    """
    Records billable actions and exposes per-tenant usage
    queries.

    The repository is injected so the unit suite can use a
    fake. The cost calculator is injected for the same
    reason; in production the service constructs a default
    :class:`CostCalculator` from the environment.
    """

    def __init__(
        self,
        repository: UsageEventRepository,
        cost_calculator: CostCalculator | None = None,
    ) -> None:
        self._repo = repository
        self._cost = cost_calculator or CostCalculator()

    # ----- writes -------------------------------------------------------

    def record(
        self,
        *,
        tenant_id: uuid.UUID,
        event_type: EventType | str,
        units: float,
        unit_type: UnitType | str = UnitType.UNITS,
        provider: str | None = None,
        model: str | None = None,
        resource_id: str | None = None,
        input_tokens: int = 0,
        output_tokens: int = 0,
        total_tokens: int | None = None,
        pricing_version: str | None = None,
        strict: bool = False,
    ) -> UsageEvent:
        """Record a billable event.

        The cost is computed by the cost calculator; the event
        is then persisted. Failures during persistence are
        logged but not re-raised — billing must never break
        the user-facing request.

        V4 Phase 11 — the caller passes the actual input /
        output / total token counts (the provider's response
        carries them; the V4 call sites plumb them through).
        The legacy ``units`` parameter is preserved as a
        denormalised total so existing read paths (e.g. the
        ``aggregate_for_tenant`` SQL sum) keep working.

        V4 Phase 12 — the caller passes the active pricing
        version (returned by the cost calculator's
        ``rate_version`` property). The version is stored on
        the row so historical events remain stable when the
        rate table changes.
        """
        # If the caller didn't pass ``total_tokens``, default
        # to the sum of input + output. The provider might
        # disagree (cache reads count once), so callers
        # that know better should pass the exact number.
        effective_total = (
            int(total_tokens)
            if total_tokens is not None
            else int(input_tokens) + int(output_tokens)
        )
        cost = self._cost.estimate(
            event_type=str(event_type),
            model=model,
            input_tokens=int(input_tokens),
            output_tokens=int(output_tokens),
        )
        event = UsageEvent(
            tenant_id=tenant_id,
            event_type=event_type,
            units=float(units),
            unit_type=unit_type,
            cost=cost,
            provider=provider,
            model=model,
            resource_id=resource_id,
            input_tokens=int(input_tokens),
            output_tokens=int(output_tokens),
            total_tokens=effective_total,
            pricing_version=pricing_version or self._cost.rate_version,
        )
        try:
            return self._repo.add(event)
        except Exception as exc:  # noqa: BLE001
            if strict:
                # V4 Phase 14 — strict mode. Re-raise as
                # a typed error so the caller's ``except``
                # clause can match it precisely. The
                # upstream LLM call has already succeeded;
                # the caller will catch this, log at
                # ``CRITICAL``, increment the failure
                # counter, and continue.
                raise UsageRecordingError(
                    tenant_id=tenant_id,
                    event_type=str(event_type),
                    original=exc,
                ) from exc
            logger.exception(
                "usage_event_recorded_failed",
                extra={
                    "tenant_id": str(tenant_id),
                    "event_type": str(event_type),
                    "units": units,
                },
            )
            return event

    # ----- reads --------------------------------------------------------

    def list_for_tenant(
        self,
        tenant_id: uuid.UUID,
        *,
        since: Any | None = None,
        until: Any | None = None,
        event_type: EventType | str | None = None,
        limit: int = 200,
    ) -> list[UsageEvent]:
        return self._repo.list_for_tenant(
            tenant_id,
            since=since,
            until=until,
            event_type=event_type,
            limit=limit,
        )

    def aggregate_for_tenant(
        self,
        tenant_id: uuid.UUID,
        *,
        since: Any | None = None,
        until: Any | None = None,
    ) -> dict[str, dict[str, float]]:
        return self._repo.aggregate_for_tenant(
            tenant_id, since=since, until=until
        )

    def summary_for_tenant(
        self,
        tenant_id: uuid.UUID,
        *,
        since: Any | None = None,
        until: Any | None = None,
    ) -> dict[str, Any]:
        """
        V4 Phase 13 — flat summary in the spec's shape:

        * ``requests``              — count of REQUEST events
        * ``embedding_tokens``      — sum of input_tokens for embedding events
        * ``completion_input_tokens``  — sum of input_tokens for completion events
        * ``completion_output_tokens`` — sum of output_tokens for completion events
        * ``rerank_units``          — sum of units for rerank events
        * ``estimated_cost_usd``    — sum of cost_usd across all events

        Every field defaults to 0 (so a tenant that has
        never used the system gets a valid ``{}``-shaped
        response, not 404).
        """
        return self._repo.summary_for_tenant(
            tenant_id, since=since, until=until
        )

    def list_for_tenant_keyset(
        self,
        tenant_id: uuid.UUID,
        *,
        since: Any | None = None,
        until: Any | None = None,
        event_type: Any | None = None,
        limit: int = 50,
        cursor: tuple[Any, uuid.UUID] | None = None,
    ) -> list[UsageEvent]:
        """
        Keyset-paginated read used by the ``/usage/events``
        admin route. ``cursor`` is a ``(created_at, id)``
        pair — the query returns rows strictly *older* than
        the cursor (newest-first ordering).
        """
        return self._repo.list_for_tenant_keyset(
            tenant_id,
            since=since,
            until=until,
            event_type=event_type,
            limit=limit,
            cursor=cursor,
        )


__all__ = ["UsageRecordingError", "UsageService", "UsageSummary"]
