"""
Audit service — the application layer that records
audit events.

The flow is small but important: every privileged
action (a document deleted, an API key revoked, a role
changed) calls :meth:`AuditService.record` with the
relevant context (actor, resource, metadata). The
service:

1. Constructs an :class:`AuditEvent`.
2. Persists it via the repository (the only write the
   audit pipeline is allowed to perform — see
   :class:`src.observability.domain.ports.AuditRepository`).
3. Emits the stable ``audit_event_recorded`` log line
   (V3 shim) so the operator's log search picks it up
   uniformly with the existing log-based audit trail.

Failure policy: audit writes are *strict* by default. A
failed audit record is logged at ``CRITICAL`` and
re-raised, because (unlike usage events) the security
value of the audit row is the entire point. The caller
catches, logs, and continues — but the failure is
*visible* (counter + critical log), so the operator
sees a gap in the audit trail.

Anti-corruption:

* The service never logs the actor's password, the
  full document content, or any other PII — the
  ``metadata`` dict is whatever the caller passes,
  and the entity's ``__post_init__`` enforces the
  size cap that keeps a single audit row from
  becoming a megabyte blob.
* The service does not enforce RBAC. RBAC is the
  route layer's job (``require_admin``); the
  service trusts the caller to have already gated
  the action.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from src.observability.domain.entities import AuditAction, AuditEvent
from src.observability.domain.ports import AuditRepository
from src.observability.infrastructure.metrics import (
    AUDIT_RECORDING_FAILURES_TOTAL,
)
from src.core.logging import get_logger, LOG_EVENTS


_logger = get_logger("cortex.audit")
_stdlib_logger = logging.getLogger(__name__)


class AuditService:
    """
    Records audit events and exposes per-tenant audit
    queries.

    The repository is injected so the unit suite can
    pass a fake. The ``strict`` flag (default ``True``)
    controls the failure policy: a failed ``append()``
    in strict mode is re-raised as
    :class:`AuditRecordingError` after a critical log
    and a counter tick; in non-strict mode the failure
    is logged at ``ERROR`` and swallowed.
    """

    def __init__(
        self,
        repository: AuditRepository,
        *,
        strict: bool = True,
    ) -> None:
        self._repo = repository
        self._strict = strict

    # ----- writes -------------------------------------------------------

    def record(
        self,
        *,
        tenant_id: uuid.UUID,
        action: AuditAction | str,
        actor_user_id: uuid.UUID | None = None,
        actor_api_key_id: uuid.UUID | None = None,
        resource_type: str | None = None,
        resource_id: str | None = None,
        metadata: dict[str, Any] | None = None,
        ip_address: str | None = None,
    ) -> AuditEvent:
        """Record an audit event.

        ``metadata`` is an arbitrary JSON-serialisable
        dict (sizes are capped by the entity's
        ``__post_init__``). The action is coerced to
        the :class:`AuditAction` enum when the caller
        passes a string.

        V4 Phase 15 — failure policy: a failure to
        persist is re-raised as
        :class:`AuditRecordingError` (strict mode, the
        default) so the operator's security audit
        surfaces the gap. Non-strict mode is provided
        for unit tests.
        """
        event = AuditEvent(
            tenant_id=tenant_id,
            action=action,
            actor_user_id=actor_user_id,
            actor_api_key_id=actor_api_key_id,
            resource_type=resource_type,
            resource_id=resource_id,
            metadata=metadata or {},
            ip_address=ip_address,
        )
        try:
            persisted = self._repo.append(event)
        except Exception as exc:  # noqa: BLE001
            action_label = (
                action.value if isinstance(action, AuditAction) else str(action)
            )
            AUDIT_RECORDING_FAILURES_TOTAL.labels(
                action=action_label,
            ).inc()
            if self._strict:
                # Use ``log`` to avoid clashing with the
                # bound logger's positional ``event``
                # argument. We still emit the stable
                # ``audit_event_recorded`` event name
                # so log-search keeps working.
                _logger.critical(
                    LOG_EVENTS["audit_event_recorded"],
                    tenant_id=str(tenant_id),
                    action=action_label,
                    error_type=type(exc).__name__,
                    outcome="failed",
                )
                raise AuditRecordingError(
                    tenant_id=tenant_id,
                    action=action_label,
                    original=exc,
                ) from exc
            _stdlib_logger.exception(
                "Failed to record audit event (tenant=%s, action=%s)",
                tenant_id,
                action_label,
            )
            return event
        _logger.info(
            LOG_EVENTS["audit_event_recorded"],
            tenant_id=str(tenant_id),
            action=(
                persisted.action.value
                if isinstance(persisted.action, AuditAction)
                else str(persisted.action)
            ),
            actor_user_id=str(persisted.actor_user_id)
            if persisted.actor_user_id
            else "",
            resource_type=persisted.resource_type or "",
            resource_id=persisted.resource_id or "",
            outcome="recorded",
        )
        return persisted

    # ----- reads --------------------------------------------------------

    def list_for_tenant(
        self,
        tenant_id: uuid.UUID,
        *,
        actor_user_id: uuid.UUID | None = None,
        action: str | None = None,
        resource_type: str | None = None,
        since: Any | None = None,
        until: Any | None = None,
        limit: int = 200,
        cursor: tuple[datetime, uuid.UUID] | None = None,
    ) -> list[AuditEvent]:
        return self._repo.list_for_tenant(
            tenant_id,
            actor_user_id=actor_user_id,
            action=action,
            resource_type=resource_type,
            since=since,
            until=until,
            limit=limit,
            cursor=cursor,
        )


# Imported here to keep the public surface small —
# callers should not need to know which DB library the
# repository uses.
from datetime import datetime  # noqa: E402


class AuditRecordingError(Exception):
    """
    V4 Phase 15 — typed error raised by
    :meth:`AuditService.record` in strict mode when the
    underlying ``append()`` fails.

    The route layer (or the V3 service that initiated
    the audited action) catches this, logs at
    ``CRITICAL``, and continues — but the failure is
    *visible*, so a security audit can spot the gap.
    """

    def __init__(
        self,
        *,
        tenant_id: uuid.UUID,
        action: str,
        original: BaseException,
    ) -> None:
        super().__init__(
            f"Failed to record audit event for tenant={tenant_id} "
            f"action={action}: {original!r}"
        )
        self.tenant_id = tenant_id
        self.action = action
        self.original = original


__all__ = ["AuditRecordingError", "AuditService"]
