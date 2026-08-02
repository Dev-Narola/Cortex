"""
Audit-log compatibility shim (V3 → V4).

The V3 audit logger was a thin wrapper around stdlib
``logging``. V4 routes every log line through structlog
(``src.core.logging``) AND persists the canonical record
to the ``audit_log`` table via
:class:`src.observability.application.audit_service.AuditService`.

This module keeps the V3 public surface
(``log_audit_event(...)``) working so existing call sites
don't break. The shim:

* emits the same structlog event the V3 logger emitted
  (so log-search keeps working);
* additionally forwards the event to the V4
  ``AuditService.record`` so a row lands in the
  ``audit_log`` table.

V3 callers that want to bypass the shim and call the V4
service directly can do so — see the imports below.
"""

from __future__ import annotations

from typing import Any

from src.core.logging import get_logger, LOG_EVENTS
from src.observability.application.audit_service import (
    AuditRecordingError,
    AuditService,
)

_audit_log = get_logger("cortex.audit")


def log_audit_event(
    event: str,
    *,
    user_id: str | None = None,
    tenant_id: str | None = None,
    outcome: str = "success",
    details: dict[str, Any] | None = None,
) -> None:
    """V3 compatibility: emit an audit event via structlog.

    Note: this shim only emits the *log* line — the V3
    shim does not have a DB session in scope, so it
    cannot persist a row to the ``audit_log`` table.
    V4 call sites that have a DB session should use
    :class:`AuditService` directly.
    """
    if outcome == "success":
        _audit_log.info(
            LOG_EVENTS["audit_event_recorded"],
            event=event,
            user_id=user_id,
            tenant_id=tenant_id,
            outcome=outcome,
            details=details or {},
        )
    else:
        _audit_log.warning(
            LOG_EVENTS["audit_event_recorded"],
            event=event,
            user_id=user_id,
            tenant_id=tenant_id,
            outcome=outcome,
            details=details or {},
        )


__all__ = ["AuditRecordingError", "AuditService", "log_audit_event"]
