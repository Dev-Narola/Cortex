"""
Observability domain ports.

V4 Phase 15 — the audit repository intentionally exposes
*only* :meth:`append` and the read methods an owner /
admin needs. There is no ``update()`` or ``delete()`` —
the audit table is append-only by application contract,
and the absence of those methods is what makes the
contract enforceable. A future developer who wants to
``UPDATE`` an audit row has to add the method to the
port, the repository, the model, and the route — four
deliberate changes that any reviewer will spot.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Protocol

from src.observability.domain.entities import AuditEvent


class AuditRepository(Protocol):
    """
    Persistence boundary for :class:`AuditEvent`.

    All read methods take ``tenant_id`` as a required
    keyword argument. Cross-tenant audit queries are
    intentionally not supported: the operator's
    investigation is scoped to their own tenant.
    """

    def append(self, event: AuditEvent) -> AuditEvent:
        """Persist a single audit event. Returns the
        event with ``created_at`` populated if it wasn't
        set by the caller."""
        ...

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
        """Read tenant audit events, newest first.

        Filters are all optional; passing none returns
        every event for the tenant up to ``limit``.
        Keyset-paginated by ``(created_at desc, id desc)``
        so the route can do admin-style scrolling without
        OFFSET performance penalties.
        """


__all__ = ["AuditRepository"]
