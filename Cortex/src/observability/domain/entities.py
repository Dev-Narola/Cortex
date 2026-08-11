"""
Observability domain entities.

V4 Phase 15 — audit logging lives here, not in a separate
``audit`` bounded context, because the action taxonomy is
operational rather than business-shaped (it spans
identity, ingestion, conversation, billing). Putting
``AuditEvent`` in the observability domain keeps the
``audit_log`` table's write/read surface co-located with
the metrics and tracing that already live here.

The :class:`AuditEvent` is the closed-shape record of
"something happened that the operator must be able to
investigate later." It is *append-only* by convention —
the repository intentionally exposes only ``append()``,
so a future developer adding ``update()`` or ``delete()``
has to make a deliberate (and reviewable) choice.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import Any, ClassVar


class AuditAction(str, Enum):
    """
    Closed set of actions that the audit pipeline records.

    Adding a new action is a deliberate decision: the
    enum shows up in every dashboard / filter UI, and
    any misspelling silently breaks the audit taxonomy.
    """

    # Document lifecycle
    DOCUMENT_CREATED = "document_created"
    DOCUMENT_ACCESSED = "document_accessed"
    DOCUMENT_DELETED = "document_deleted"
    DOCUMENT_INGESTION_STARTED = "document_ingestion_started"
    DOCUMENT_INGESTION_COMPLETED = "document_ingestion_completed"
    DOCUMENT_INGESTION_FAILED = "document_ingestion_failed"
    # API keys
    API_KEY_CREATED = "api_key_created"
    API_KEY_REVOKED = "api_key_revoked"
    # Tenant / user / RBAC
    TENANT_UPDATED = "tenant_updated"
    TENANT_CREATED = "tenant_created"
    USER_UPDATED = "user_updated"
    USER_INVITED = "user_invited"
    USER_REMOVED = "user_removed"
    ROLE_CHANGED = "role_changed"
    # Conversation
    CONVERSATION_CREATED = "conversation_created"
    CONVERSATION_ACCESSED = "conversation_accessed"
    CONVERSATION_RENAMED = "conversation_renamed"
    CONVERSATION_DELETED = "conversation_deleted"
    # Auth
    LOGIN_SUCCESS = "login_success"
    LOGIN_FAILURE = "login_failure"
    LOGOUT = "logout"


# The resource types the audit taxonomy knows about.
# Free-form strings are rejected by the entity's
# ``__post_init__`` (defence in depth — the DB CHECK is
# the source of truth, but the entity is the
# application-layer first line of defence).
_ALLOWED_RESOURCE_TYPES: frozenset[str] = frozenset(
    {
        "document",
        "chunk",
        "api_key",
        "tenant",
        "user",
        "role",
        "conversation",
        "message",
        "session",
    }
)


@dataclass(eq=False)
class AuditEvent:
    """
    An immutable record of an action that the operator
    must be able to investigate later.

    The entity enforces two invariants:

    * ``tenant_id`` is required. The audit table is
      tenant-scoped — there is no "global" audit row.
      (The DB schema's ``NOT NULL`` matches.)
    * ``action`` is one of the :class:`AuditAction`
      values, coerced from a string when the caller
      passes the literal.

    The entity is otherwise deliberately permissive:
    ``metadata`` is a free-form JSON object, ``ip_address``
    is a string (so v4 / v6 both work), and ``actor_*``
    fields are nullable so a *system*-initiated action
    (e.g. the worker ingesting a document) can be
    recorded without a synthetic user.
    """

    tenant_id: uuid.UUID
    action: AuditAction | str
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    actor_user_id: uuid.UUID | None = None
    actor_api_key_id: uuid.UUID | None = None
    resource_type: str | None = None
    resource_id: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    ip_address: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    _METADATA_KEYS_MAX: ClassVar[int] = 64
    _METADATA_KEY_MAX_LEN: ClassVar[int] = 64
    _METADATA_VALUE_MAX_LEN: ClassVar[int] = 1024
    _IP_MAX_LEN: ClassVar[int] = 64

    def __post_init__(self) -> None:
        if not isinstance(self.tenant_id, uuid.UUID):
            raise ValueError("AuditEvent.tenant_id must be a UUID")
        if isinstance(self.action, str):
            try:
                self.action = AuditAction(self.action)
            except ValueError as exc:
                raise ValueError(
                    f"AuditEvent.action must be one of: "
                    f"{[a.value for a in AuditAction]}"
                ) from exc
        if self.resource_type is not None:
            if self.resource_type not in _ALLOWED_RESOURCE_TYPES:
                raise ValueError(
                    f"AuditEvent.resource_type must be one of: "
                    f"{sorted(_ALLOWED_RESOURCE_TYPES)}"
                )
        if not isinstance(self.metadata, dict):
            raise ValueError("AuditEvent.metadata must be a dict")
        # Defensive cap: a single audit row should not
        # carry megabytes of metadata. The application
        # layer is expected to summarise; the entity
        # enforces the cap.
        if len(self.metadata) > self._METADATA_KEYS_MAX:
            raise ValueError(
                f"AuditEvent.metadata has too many keys "
                f"({len(self.metadata)} > {self._METADATA_KEYS_MAX})"
            )
        for k, v in self.metadata.items():
            if not isinstance(k, str) or len(k) > self._METADATA_KEY_MAX_LEN:
                raise ValueError(
                    f"AuditEvent.metadata key invalid: {k!r}"
                )
            if isinstance(v, str) and len(v) > self._METADATA_VALUE_MAX_LEN:
                raise ValueError(
                    f"AuditEvent.metadata[{k!r}] value too long "
                    f"({len(v)} > {self._METADATA_VALUE_MAX_LEN})"
                )
        if self.ip_address is not None and len(self.ip_address) > self._IP_MAX_LEN:
            raise ValueError(
                f"AuditEvent.ip_address too long ({len(self.ip_address)} > "
                f"{self._IP_MAX_LEN})"
            )


__all__ = [
    "AuditAction",
    "AuditEvent",
]
