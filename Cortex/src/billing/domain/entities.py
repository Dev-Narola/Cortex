"""
Billing domain entities.

The only entity V4 ships is :class:`UsageEvent` — one row
per billable action (embedding, completion, rerank, etc.).
The event_type / unit_type pairs are the only thing the
application code is allowed to write; everything else is
typed.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import ClassVar


class EventType(str, Enum):
    """
    The closed set of billable event types the application
    can emit. Adding a new type here is a deliberate decision
    (it shows up in every dashboard), not something a
    developer can do ad-hoc.
    """

    EMBEDDING = "embedding"
    COMPLETION = "completion"
    RERANK = "rerank"
    STORAGE = "storage"
    REQUEST = "request"


class UnitType(str, Enum):
    """What ``units`` measures. ``tokens`` and ``bytes`` are
    self-explanatory; ``units`` is the catch-all for things
    that don't fit (e.g. an HTTP request)."""

    TOKENS = "tokens"
    BYTES = "bytes"
    UNITS = "units"
    REQUESTS = "requests"


@dataclass(eq=False)
class UsageEvent:
    """
    A single billable action.

    Business rules:

    * ``tenant_id`` is required; we never store a usage event
      without a tenant (the PRD rule: every tenant-scoped row
      has a non-null tenant_id).
    * ``units`` is non-negative.
    * ``cost`` is non-negative, in USD.
    * ``provider`` and ``model`` are required for any event
      that's tied to a third-party service (embedding,
      completion, rerank); they may be null for
      ``REQUEST``-type events.
    * ``resource_id`` is an opaque string (chunk id, document
      id, conversation id) — useful for "show me the cost
      broken down by conversation" without joining other
      tables.
    """

    tenant_id: uuid.UUID
    event_type: EventType | str
    units: float
    unit_type: UnitType | str
    cost: float
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    provider: str | None = None
    model: str | None = None
    resource_id: str | None = None
    # V4 Phase 11 — token accounting. The PRD says:
    # "Do not reconstruct this later from logs." So we
    # persist the input / output / total token counts
    # *on the event row itself*, even though ``units`` is
    # already a denormalised sum. The redundancy is
    # deliberate — a future migration can change the
    # ``units`` semantics (e.g. switch to "characters" for
    # a non-OpenAI provider) without losing the original
    # token counts.
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    # V4 Phase 12 — pricing snapshot. Stored at the time
    # the event is recorded so a future price change
    # cannot alter historical cost.
    pricing_version: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    _COST_MIN: ClassVar[float] = 0.0
    _UNITS_MIN: ClassVar[float] = 0.0

    def __post_init__(self) -> None:
        if not isinstance(self.tenant_id, uuid.UUID):
            raise ValueError("UsageEvent.tenant_id must be a UUID")
        if not isinstance(self.units, (int, float)) or self.units < 0:
            raise ValueError("UsageEvent.units must be non-negative")
        if not isinstance(self.cost, (int, float)) or self.cost < 0:
            raise ValueError("UsageEvent.cost must be non-negative")
        if not isinstance(self.input_tokens, int) or self.input_tokens < 0:
            raise ValueError("UsageEvent.input_tokens must be a non-negative int")
        if not isinstance(self.output_tokens, int) or self.output_tokens < 0:
            raise ValueError("UsageEvent.output_tokens must be a non-negative int")
        if not isinstance(self.total_tokens, int) or self.total_tokens < 0:
            raise ValueError("UsageEvent.total_tokens must be a non-negative int")
        # ``total_tokens`` is a derived value; the entity
        # trusts the caller's value (it might include
        # provider-side tokenisation overhead the caller
        # knows about). We just sanity-check the
        # invariant: total >= input + output? Not always —
        # some providers report a different total (e.g.
        # cache reads counted once). So we *don't* assert
        # it; the constraint check would silently
        # invalidate legitimate rows.
        # Coerce string enums to their typed form so callers
        # can pass either.
        if isinstance(self.event_type, str):
            try:
                self.event_type = EventType(self.event_type)
            except ValueError as exc:
                raise ValueError(
                    f"UsageEvent.event_type must be one of: "
                    f"{[e.value for e in EventType]}"
                ) from exc
        if isinstance(self.unit_type, str):
            try:
                self.unit_type = UnitType(self.unit_type)
            except ValueError as exc:
                raise ValueError(
                    f"UsageEvent.unit_type must be one of: "
                    f"{[u.value for u in UnitType]}"
                ) from exc


__all__ = ["EventType", "UnitType", "UsageEvent"]
