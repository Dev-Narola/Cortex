"""
``AuditLogger`` — structured security events.

V9 Part 3, Task 36.

Every login attempt, permission denial, MCP auth failure,
secret access, and administrative action is recorded as an
:class:`AuditEvent`. The logger writes to a pluggable
backend (the default is the in-process list; production
should swap in the database / S3 sink).
"""

from __future__ import annotations

import json
from collections import deque
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import Any, Protocol
from uuid import UUID


class AuditSeverity(str, Enum):
    """Severity of an audit event."""

    INFO = "info"
    WARN = "warn"
    CRITICAL = "critical"


@dataclass(frozen=True)
class AuditEvent:
    """One immutable audit event."""

    tenant_id: UUID | None
    user_id: UUID | None
    request_id: str | None
    action: str
    result: str
    severity: AuditSeverity
    ip_address: str | None
    user_agent: str | None
    metadata: dict[str, Any] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=lambda: datetime.now(UTC))

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["tenant_id"] = str(self.tenant_id) if self.tenant_id else None
        data["user_id"] = str(self.user_id) if self.user_id else None
        data["timestamp"] = self.timestamp.isoformat()
        data["severity"] = self.severity.value
        return data


class AuditSink(Protocol):
    """Pluggable backend for audit events."""

    async def write(self, event: AuditEvent) -> None: ...


class InMemoryAuditSink:
    """In-memory sink used by tests and the default dev profile."""

    def __init__(self, *, max_size: int = 10_000) -> None:
        self._buffer: deque[AuditEvent] = deque(maxlen=max_size)

    async def write(self, event: AuditEvent) -> None:
        self._buffer.append(event)

    def snapshot(self) -> list[AuditEvent]:
        return list(self._buffer)


class AuditLogger:
    """High-level facade for the application to log security events.

    The logger is intentionally small: the actual decision
    of *what* to log lives in the application code; the
    logger just ensures every event is structured and
    delivered to the sink.
    """

    def __init__(self, sink: AuditSink | None = None) -> None:
        self._sink = sink or InMemoryAuditSink()

    async def record(
        self,
        *,
        action: str,
        result: str,
        severity: AuditSeverity = AuditSeverity.INFO,
        tenant_id: UUID | None = None,
        user_id: UUID | None = None,
        request_id: str | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> AuditEvent:
        event = AuditEvent(
            tenant_id=tenant_id,
            user_id=user_id,
            request_id=request_id,
            action=action,
            result=result,
            severity=severity,
            ip_address=ip_address,
            user_agent=user_agent,
            metadata=metadata or {},
        )
        await self._sink.write(event)
        return event

    def snapshot(self) -> list[AuditEvent]:
        sink = self._sink
        if isinstance(sink, InMemoryAuditSink):
            return sink.snapshot()
        return []
