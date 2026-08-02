"""Tests for SecurityHeaders + AuditLogger."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from src.platform.security import (
    AuditLogger,
    AuditSeverity,
    InMemoryAuditSink,
    SecurityHeadersConfig,
    SecurityHeadersMiddleware,
)


class TestSecurityHeaders:
    async def test_middleware_injects_headers(self) -> None:
        captured: list[dict] = []

        async def app(scope, receive, send):
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b""})

        async def send(message):
            captured.append(message)

        mw = SecurityHeadersMiddleware(
            app,
            config=SecurityHeadersConfig(extra_headers={"x-test": "1"}),
        )
        await mw({"type": "http"}, None, send)
        start = next(m for m in captured if m["type"] == "http.response.start")
        names = {h[0].decode("latin-1") for h in start["headers"]}
        assert "strict-transport-security" in names
        assert "content-security-policy" in names
        assert "x-content-type-options" in names
        assert "referrer-policy" in names
        assert "permissions-policy" in names
        assert "x-frame-options" in names
        assert "x-test" in names

    async def test_middleware_can_be_disabled(self) -> None:
        captured: list[dict] = []

        async def app(scope, receive, send):
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b""})

        async def send(message):
            captured.append(message)

        mw = SecurityHeadersMiddleware(
            app, config=SecurityHeadersConfig(enabled=False)
        )
        await mw({"type": "http"}, None, send)
        start = next(m for m in captured if m["type"] == "http.response.start")
        names = {h[0].decode("latin-1") for h in start["headers"]}
        assert "strict-transport-security" not in names


class TestAuditLogger:
    async def test_record_creates_event(self) -> None:
        sink = InMemoryAuditSink()
        logger = AuditLogger(sink=sink)
        event = await logger.record(
            action="auth.login",
            result="success",
            tenant_id=uuid4(),
            user_id=uuid4(),
            request_id="req-1",
            ip_address="1.2.3.4",
            user_agent="test",
        )
        assert event.action == "auth.login"
        assert event.severity is AuditSeverity.INFO
        assert len(sink.snapshot()) == 1

    async def test_snapshot_isolated_per_logger(self) -> None:
        logger1 = AuditLogger()
        logger2 = AuditLogger()
        await logger1.record(action="a", result="ok")
        await logger2.record(action="b", result="ok")
        s1 = logger1.snapshot()
        s2 = logger2.snapshot()
        assert len(s1) == 1
        assert len(s2) == 1
        assert s1[0].action == "a"
        assert s2[0].action == "b"

    async def test_event_to_dict(self) -> None:
        tenant = uuid4()
        user = uuid4()
        event = await AuditLogger().record(
            action="permission.denied",
            result="failure",
            severity=AuditSeverity.WARN,
            tenant_id=tenant,
            user_id=user,
        )
        d = event.to_dict()
        assert d["tenant_id"] == str(tenant)
        assert d["user_id"] == str(user)
        assert d["severity"] == "warn"
