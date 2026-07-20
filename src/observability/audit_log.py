"""
Audit logging initialization layer for observability.
"""

import logging
from typing import Any

# Audit logger - to be configured by the application
audit_logger = logging.getLogger("audit")


def log_audit_event(
    event: str,
    *,
    user_id: str | None = None,
    tenant_id: str | None = None,
    outcome: str = "success",
    details: dict[str, Any] | None = None,
) -> None:
    """
    Log an audit event.
    This function provides a structured way to log audit events.
    The actual logging configuration is done by the application.

    Args:
        event: The name of the event (e.g., "user_login", "data_access")
        user_id: Optional ID of the user associated with the event
        tenant_id: Optional ID of the tenant associated with the event
        outcome: Outcome of the event (e.g., "success", "failure")
        details: Additional details about the event as a dictionary
    """
    log_entry = {
        "event": event,
        "user_id": user_id,
        "tenant_id": tenant_id,
        "outcome": outcome,
        "details": details or {},
    }
    audit_logger.info("Audit event", extra=log_entry)
