"""
Audit log REST surface (admin / owner).

V4 Phase 15 — ``GET /audit-log``.

* Restricted to ``owner`` and ``admin`` roles (the
  ``member`` and ``viewer`` roles cannot see the
  tenant's full audit history).
* Tenant-scoped at the repository layer (the route
  resolves the tenant from the authenticated user,
  never from a query parameter; cross-tenant audit
  access is impossible by construction).
* Keyset-paginated by ``(created_at desc, id desc)``
  using an opaque base64 cursor, matching the
  ``GET /usage/events`` pattern.

Append-only enforcement is at the repository level —
this route does not expose ``update()`` or ``delete()``
on the audit table.
"""

from __future__ import annotations

import base64
import json
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.core.dependencies import get_current_user, get_db
from src.observability.application.audit_service import AuditService
from src.observability.infrastructure.repositories import AuditSqlRepository
from src.shared.exceptions import UnauthorizedException


router = APIRouter(tags=["audit"])


# --- schemas ----------------------------------------------------------------


class AuditEventSchema(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    action: str
    actor_user_id: uuid.UUID | None = None
    actor_api_key_id: uuid.UUID | None = None
    resource_type: str | None = None
    resource_id: str | None = None
    metadata: dict[str, Any] = {}
    ip_address: str | None = None
    created_at: datetime


class AuditEventListResponse(BaseModel):
    items: list[AuditEventSchema]
    next_cursor: str | None = None


# --- helpers ---------------------------------------------------------------


def _build_service(db: Session) -> AuditService:
    return AuditService(repository=AuditSqlRepository(db))


def _encode_cursor(created_at: datetime, row_id: uuid.UUID) -> str:
    payload = {
        "created_at": created_at.isoformat(),
        "id": str(row_id),
    }
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii")


def _decode_cursor(cursor: str | None) -> tuple[datetime, uuid.UUID] | None:
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


def _event_to_schema(e: Any) -> AuditEventSchema:
    return AuditEventSchema(
        id=e.id,
        tenant_id=e.tenant_id,
        action=e.action.value if hasattr(e.action, "value") else str(e.action),
        actor_user_id=e.actor_user_id,
        actor_api_key_id=e.actor_api_key_id,
        resource_type=e.resource_type,
        resource_id=e.resource_id,
        metadata=dict(e.metadata or {}),
        ip_address=e.ip_address,
        created_at=e.created_at,
    )


# --- routes ----------------------------------------------------------------


@router.get(
    "/audit-log",
    response_model=AuditEventListResponse,
    summary="Tenant audit log (owner/admin only)",
)
def list_audit_log(
    actor_user_id: uuid.UUID | None = Query(default=None),
    action: str | None = Query(default=None),
    resource_type: str | None = Query(default=None),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    limit: int = Query(50, ge=1, le=500),
    cursor: str | None = Query(default=None),
    user_tenant: tuple[Any, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuditEventListResponse:
    """
    Return the tenant's audit log, newest first.

    Restricted to ``owner`` / ``admin`` roles. A
    ``member`` or ``viewer`` sees a 403.

    Tenant isolation: the route resolves the tenant
    from the authenticated user's JWT (never from a
    query parameter); a Tenant A admin *cannot* see
    Tenant B's audit log because Tenant B's tenant id
    is not in their JWT.
    """
    from src.identity.domain.entities import Role

    user, tenant = user_tenant
    if not user.role.can_act_as(Role.ADMIN):
        raise UnauthorizedException(
            message="Listing audit log requires admin or owner role.",
            code=403,
            data={"required_role": Role.ADMIN.value},
        )

    service = _build_service(db)
    decoded = _decode_cursor(cursor)
    events = service.list_for_tenant(
        tenant_id=tenant.id,
        actor_user_id=actor_user_id,
        action=action,
        resource_type=resource_type,
        since=start_date,
        until=end_date,
        limit=limit,
        cursor=decoded,
    )
    next_cursor: str | None = None
    if len(events) == limit and events:
        last = events[-1]
        next_cursor = _encode_cursor(last.created_at, last.id)
    return AuditEventListResponse(
        items=[_event_to_schema(e) for e in events],
        next_cursor=next_cursor,
    )


__all__ = ["router", "list_audit_log"]
