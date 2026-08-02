"""
REST API for the billing bounded context.

The V3 plan called for ``GET /tenants/me/usage``; V4
implements it on top of the new :class:`UsageEvent` table.
The route lives in the billing context, not in identity,
because usage is a billing concept (even if the data is
about a specific tenant).

V4 Phase 13 — two new endpoints:

* ``GET /tenants/me/usage/summary`` — the spec-shape
  flat summary (requests, embedding_tokens,
  completion_input_tokens, completion_output_tokens,
  rerank_units, estimated_cost_usd). The UI's "Usage &
  Billing" tab consumes this shape.
* ``GET /usage/events`` — admin/owner view of the
  tenant's events with date filters and keyset
  cursor pagination. Lives at the API root (not under
  ``/tenants``) because the spec asks for the bare
  ``/usage/events`` path.
"""

from __future__ import annotations

import base64
import json
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from src.billing.application.usage_service import UsageService
from src.billing.infrastructure.repositories import UsageEventSqlRepository
from src.core.dependencies import get_current_user, get_db
from src.shared.exceptions import NotFoundException, UnauthorizedException


# The spec routes ``/tenants/me/usage/...`` paths through
# this router; ``/usage/events`` is mounted on a separate
# router below so the prefix is the API root.
router = APIRouter(prefix="/tenants", tags=["billing"])
admin_router = APIRouter(tags=["billing"])


# --- schemas ----------------------------------------------------------------


class UsageEntry(BaseModel):
    event_type: str
    unit_type: str
    units: float
    cost_usd: float


class TenantUsageResponse(BaseModel):
    tenant_id: uuid.UUID
    period_start: datetime | None
    period_end: datetime | None
    total_cost_usd: float
    by_event: dict[str, dict[str, float]] = Field(default_factory=dict)


class UsageSummaryResponse(BaseModel):
    """V4 Phase 13 spec shape.

    Flat, dashboard-friendly breakdown. Each field is the
    sum over the requested period; ``estimated_cost_usd``
    is the sum of the per-event cost columns (it
    intentionally does not back-derive from token counts,
    because a future "free" event type would not need to
    report tokens to contribute to the cost).
    """

    period: dict[str, datetime] = Field(
        description="Inclusive lower / exclusive upper bound (UTC)."
    )
    requests: int = Field(
        description="Count of REQUEST-type events in the period."
    )
    embedding_tokens: int = Field(
        description="Sum of input_tokens for embedding events."
    )
    completion_input_tokens: int = Field(
        description="Sum of input_tokens for completion events."
    )
    completion_output_tokens: int = Field(
        description="Sum of output_tokens for completion events."
    )
    rerank_units: int = Field(
        description="Sum of units for rerank events (candidates)."
    )
    estimated_cost_usd: float = Field(
        description="Total cost for the period, in USD."
    )


class UsageEventSchema(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    event_type: str
    units: float
    unit_type: str
    cost_usd: float
    provider: str | None = None
    model: str | None = None
    resource_id: str | None = None
    # V4 Phase 11 — token accounting.
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    # V4 Phase 12 — pricing version snapshot.
    pricing_version: str | None = None
    created_at: datetime


class UsageEventListResponse(BaseModel):
    """Paged response for ``GET /usage/events``."""

    items: list[UsageEventSchema]
    next_cursor: str | None = Field(
        default=None,
        description="Opaque cursor for the next page. ``None`` if there are no more rows.",
    )


# --- helpers ---------------------------------------------------------------


def _build_service(db: Session) -> UsageService:
    return UsageService(repository=UsageEventSqlRepository(db))


def _event_to_schema(e: Any) -> UsageEventSchema:
    return UsageEventSchema(
        id=e.id,
        tenant_id=e.tenant_id,
        event_type=e.event_type.value
        if hasattr(e.event_type, "value")
        else str(e.event_type),
        units=e.units,
        unit_type=e.unit_type.value
        if hasattr(e.unit_type, "value")
        else str(e.unit_type),
        cost_usd=e.cost,
        provider=e.provider,
        model=e.model,
        resource_id=e.resource_id,
        input_tokens=int(e.input_tokens),
        output_tokens=int(e.output_tokens),
        total_tokens=int(e.total_tokens),
        pricing_version=e.pricing_version,
        created_at=e.created_at,
    )


def _decode_cursor(cursor: str | None) -> tuple[datetime, uuid.UUID] | None:
    """Decode a keyset cursor of the form
    ``base64(json({"created_at": iso, "id": uuid}))``.

    Returns ``None`` for a missing / unparseable cursor
    (the route treats that as "first page" — strict
    pagination is overkill for a billing dashboard).
    """
    if not cursor:
        return None
    try:
        raw = base64.urlsafe_b64decode(cursor.encode("ascii"))
        payload = json.loads(raw.decode("utf-8"))
        return (
            datetime.fromisoformat(payload["created_at"]),
            uuid.UUID(payload["id"]),
        )
    except (ValueError, KeyError, TypeError):
        return None


def _encode_cursor(created_at: datetime, row_id: uuid.UUID) -> str:
    """Encode a keyset cursor. Inverse of
    :func:`_decode_cursor`."""
    payload = {
        "created_at": created_at.isoformat(),
        "id": str(row_id),
    }
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii")


# --- routes ----------------------------------------------------------------


@router.get(
    "/me/usage",
    response_model=TenantUsageResponse,
    summary="Per-tenant usage aggregate (cost, units, by event type)",
)
def get_my_usage(
    period_start: datetime | None = Query(
        default=None,
        description="Inclusive lower bound (UTC). Defaults to the start of the current calendar month.",
    ),
    period_end: datetime | None = Query(
        default=None,
        description="Exclusive upper bound (UTC). Defaults to now.",
    ),
    user_tenant: tuple[Any, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TenantUsageResponse:
    """
    Return usage for the authenticated user's tenant over the
    given period. The default period is "the current
    calendar month to now" — that's what the UI's "Usage &
    Billing" tab needs by default.
    """
    _, tenant = user_tenant
    if period_start is None:
        now = datetime.now(UTC)
        period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if period_end is None:
        period_end = datetime.now(UTC)

    service = _build_service(db)
    aggregate = service.aggregate_for_tenant(
        tenant.id, since=period_start, until=period_end
    )

    # The aggregate dict mixes per-(event_type, unit_type) rows
    # with the total_cost_usd key. Pull the total out for the
    # top-level field and keep the per-event breakdown.
    total = float(aggregate.pop("total_cost_usd", 0.0) or 0.0)

    return TenantUsageResponse(
        tenant_id=tenant.id,
        period_start=period_start,
        period_end=period_end,
        total_cost_usd=total,
        by_event=aggregate,
    )


@router.get(
    "/me/usage/summary",
    response_model=UsageSummaryResponse,
    summary="Per-tenant flat usage summary (V4 spec shape)",
)
def get_my_usage_summary(
    period_start: datetime | None = Query(default=None),
    period_end: datetime | None = Query(default=None),
    user_tenant: tuple[Any, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UsageSummaryResponse:
    """
    Return the V4-spec flat summary for the authenticated
    tenant. Each field is the sum over the period; the cost
    is the sum of the per-event cost column.
    """
    _, tenant = user_tenant
    if period_start is None:
        now = datetime.now(UTC)
        period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if period_end is None:
        period_end = datetime.now(UTC)

    service = _build_service(db)
    summary = service.summary_for_tenant(
        tenant.id, since=period_start, until=period_end
    )
    return UsageSummaryResponse(
        period={"from": period_start, "to": period_end},
        **summary,
    )


@router.get(
    "/me/usage/events",
    response_model=list[UsageEventSchema],
    summary="Raw usage events for the authenticated tenant",
)
def list_my_usage_events(
    limit: int = Query(50, ge=1, le=500),
    event_type: str | None = Query(default=None),
    user_tenant: tuple[Any, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[UsageEventSchema]:
    """Return the tenant's raw usage events, newest first.

    Useful for debugging a billing spike — the UI shows the
    aggregate; this endpoint lets an admin drill in.
    """
    _, tenant = user_tenant
    service = _build_service(db)
    events = service.list_for_tenant(
        tenant.id, event_type=event_type, limit=limit
    )
    return [_event_to_schema(e) for e in events]


# --- /usage/events (admin / owner) -----------------------------------------


@admin_router.get(
    "/usage/events",
    response_model=UsageEventListResponse,
    summary="Tenant usage events with date filters + cursor pagination (owner/admin)",
)
def list_usage_events(
    start_date: datetime | None = Query(
        default=None,
        description="Inclusive lower bound (UTC).",
    ),
    end_date: datetime | None = Query(
        default=None,
        description="Exclusive upper bound (UTC).",
    ),
    event_type: str | None = Query(default=None),
    limit: int = Query(50, ge=1, le=500),
    cursor: str | None = Query(
        default=None,
        description="Opaque keyset cursor returned by a previous call.",
    ),
    user_tenant: tuple[Any, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UsageEventListResponse:
    """
    Return the tenant's usage events, newest first, with
    date filters and keyset pagination. Restricted to
    ``owner`` and ``admin`` roles — ``member`` and
    ``viewer`` cannot see the tenant's full cost history.

    Pagination is keyset on ``(created_at desc, id desc)``,
    which is the natural order the index
    ``(tenant_id, created_at)`` already provides. The
    cursor is an opaque base64-encoded JSON blob.
    """
    from src.identity.domain.entities import Role

    user, tenant = user_tenant
    if not user.role.can_act_as(Role.ADMIN):
        raise UnauthorizedException(
            message="Listing tenant usage events requires admin or owner role.",
            code=403,
            data={"required_role": Role.ADMIN.value},
        )

    service = _build_service(db)
    decoded = _decode_cursor(cursor)
    events = service.list_for_tenant_keyset(
        tenant_id=tenant.id,
        since=start_date,
        until=end_date,
        event_type=event_type,
        limit=limit,
        cursor=decoded,
    )
    next_cursor: str | None = None
    if len(events) == limit and events:
        # ``events`` is newest-first; the *last* row in the
        # page is the boundary for the next page.
        last = events[-1]
        next_cursor = _encode_cursor(last.created_at, last.id)
    return UsageEventListResponse(
        items=[_event_to_schema(e) for e in events],
        next_cursor=next_cursor,
    )


__all__ = [
    "admin_router",
    "router",
    "get_my_usage",
    "get_my_usage_summary",
    "list_my_usage_events",
    "list_usage_events",
]
