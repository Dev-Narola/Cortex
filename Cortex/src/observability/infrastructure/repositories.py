"""
SQLAlchemy implementation of the observability repositories.

V4 Phase 15 — audit log repository.

The repository intentionally exposes **only** :meth:`append`
and :meth:`list_for_tenant`. There is no ``update()`` or
``delete()`` — the audit table is append-only by application
contract, and the absence of those methods is what makes the
contract enforceable.

A future developer who needs to *correct* an audit row has
to add the method to the
:class:`src.observability.domain.ports.AuditRepository`
protocol, the concrete implementation here, the SQLAlchemy
model, and the route — four deliberate changes that any
reviewer will spot.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from src.observability.domain.entities import AuditAction, AuditEvent
from src.observability.domain.ports import AuditRepository
from src.observability.infrastructure.models import AuditLogModel


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def _model_to_entity(m: AuditLogModel) -> AuditEvent:
    return AuditEvent(
        id=m.id,
        tenant_id=m.tenant_id,
        action=m.action,
        actor_user_id=m.actor_user_id,
        actor_api_key_id=m.actor_api_key_id,
        resource_type=m.resource_type,
        resource_id=m.resource_id,
        metadata=dict(m.metadata_json or {}),
        ip_address=m.ip_address,
        created_at=_as_utc(m.created_at),
    )


class AuditSqlRepository(AuditRepository):
    """Sync SQLAlchemy implementation of :class:`AuditRepository`."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def append(self, event: AuditEvent) -> AuditEvent:
        """Persist a single audit event.

        This is the **only** write the audit pipeline is
        allowed to perform. There is intentionally no
        ``update()`` or ``delete()`` method on the
        repository — the table is append-only.
        """
        model = AuditLogModel(
            id=event.id,
            tenant_id=event.tenant_id,
            action=event.action.value
            if isinstance(event.action, AuditAction)
            else str(event.action),
            actor_user_id=event.actor_user_id,
            actor_api_key_id=event.actor_api_key_id,
            resource_type=event.resource_type,
            resource_id=event.resource_id,
            metadata_json=dict(event.metadata or {}),
            ip_address=event.ip_address,
            created_at=event.created_at,
        )
        self._session.add(model)
        self._session.flush()
        return _model_to_entity(model)

    def list_for_tenant(
        self,
        tenant_id: uuid.UUID,
        *,
        actor_user_id: uuid.UUID | None = None,
        action: str | None = None,
        resource_type: str | None = None,
        since: datetime | None = None,
        until: datetime | None = None,
        limit: int = 200,
        cursor: tuple[datetime, uuid.UUID] | None = None,
    ) -> list[AuditEvent]:
        """
        Read tenant audit events, newest first.

        The route layer enforces the owner/admin RBAC
        check; the repository enforces the *tenant*
        scope (every query takes ``tenant_id`` as a
        required keyword — there is no cross-tenant
        list path).
        """
        stmt = (
            select(AuditLogModel)
            .where(AuditLogModel.tenant_id == tenant_id)
            .order_by(
                AuditLogModel.created_at.desc(),
                AuditLogModel.id.desc(),
            )
            .limit(max(1, limit))
        )
        if actor_user_id is not None:
            stmt = stmt.where(AuditLogModel.actor_user_id == actor_user_id)
        if action is not None:
            stmt = stmt.where(AuditLogModel.action == action)
        if resource_type is not None:
            stmt = stmt.where(AuditLogModel.resource_type == resource_type)
        if since is not None:
            stmt = stmt.where(AuditLogModel.created_at >= _as_utc(since))
        if until is not None:
            stmt = stmt.where(AuditLogModel.created_at < _as_utc(until))
        if cursor is not None:
            cursor_ts, cursor_id = cursor
            # Newest-first ordering: the next page is
            # strictly *older* than the cursor.
            stmt = stmt.where(
                or_(
                    AuditLogModel.created_at < cursor_ts,
                    (AuditLogModel.created_at == cursor_ts)
                    & (AuditLogModel.id < cursor_id),
                )
            )
        models: Sequence[AuditLogModel] = self._session.execute(stmt).scalars().all()
        return [_model_to_entity(m) for m in models]


__all__ = ["AuditSqlRepository"]
