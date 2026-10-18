"""HTTP security hardening + audit hooks.

V9 Part 3, Task 28.

* :class:`SecurityHeadersMiddleware` adds the HSTS, CSP,
  X-Content-Type-Options, Referrer-Policy, Permissions-Policy
  and X-Frame-Options headers to every response.
* :class:`AuditLogger` writes structured security events to
  the audit log (V9 Part 3, Task 36).
"""

from __future__ import annotations

from src.platform.security.headers import (
    SecurityHeadersConfig,
    SecurityHeadersMiddleware,
)
from src.platform.security.audit import (
    AuditEvent,
    AuditLogger,
    AuditSeverity,
    InMemoryAuditSink,
)

__all__ = [
    "SecurityHeadersConfig",
    "SecurityHeadersMiddleware",
    "AuditEvent",
    "AuditLogger",
    "AuditSeverity",
    "InMemoryAuditSink",
]
