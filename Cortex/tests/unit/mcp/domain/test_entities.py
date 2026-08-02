"""
Unit tests for MCP domain entities — MCPClient and MCPSession.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest

from src.mcp.domain.entities import MCPClient, MCPSession
from src.mcp.domain.value_objects import (
    MCPCapability,
    MCPClientType,
    MCPSessionState,
    MCPTransport,
)
from src.shared.exceptions import ValidationException


class TestMCPClient:
    """Tests for the MCPClient domain entity."""

    def test_create_minimal(self):
        tenant = uuid.uuid4()
        client = MCPClient.create(tenant_id=tenant, name="Claude Desktop")
        assert client.tenant_id == tenant
        assert client.name == "Claude Desktop"
        assert client.client_type == MCPClientType.CUSTOM
        assert client.is_active is True
        assert isinstance(client.id, uuid.UUID)

    def test_create_with_capabilities(self):
        client = MCPClient.create(
            tenant_id=uuid.uuid4(),
            name="Cursor",
            client_type="ide",
            version="2.0.0",
            allowed_capabilities=("tools", "resources"),
        )
        assert client.client_type == MCPClientType.IDE
        assert client.version == "2.0.0"
        assert MCPCapability.TOOLS in client.allowed_capabilities
        assert MCPCapability.RESOURCES in client.allowed_capabilities

    def test_create_strips_name(self):
        client = MCPClient.create(tenant_id=uuid.uuid4(), name="  Padded  ")
        assert client.name == "Padded"

    def test_create_rejects_empty_name(self):
        with pytest.raises(ValidationException):
            MCPClient.create(tenant_id=uuid.uuid4(), name="")

    def test_create_rejects_bad_tenant_id(self):
        with pytest.raises(ValidationException):
            MCPClient.create(tenant_id="not-a-uuid", name="Bad")


class TestMCPSession:
    """Tests for the MCPSession domain entity."""

    def test_create_defaults(self):
        tenant = uuid.uuid4()
        client = uuid.uuid4()
        session = MCPSession.create(
            tenant_id=tenant, client_id=client, client_name="Test",
        )
        assert session.tenant_id == tenant
        assert session.client_id == client
        assert session.state == MCPSessionState.INITIALIZING
        assert session.transport == MCPTransport.WEBSOCKET

    def test_create_custom_transport(self):
        session = MCPSession.create(
            tenant_id=uuid.uuid4(),
            client_id=uuid.uuid4(),
            client_name="Test",
            transport="http",
        )
        assert session.transport == MCPTransport.HTTP

    def test_create_rejects_bad_ids(self):
        with pytest.raises(ValidationException):
            MCPSession.create(
                tenant_id="bad", client_id=uuid.uuid4(), client_name="X",
            )

    def test_is_expired_before_timeout(self):
        session = MCPSession.create(
            tenant_id=uuid.uuid4(),
            client_id=uuid.uuid4(),
            client_name="Test",
            timeout_seconds=3600,
        )
        assert session.is_expired() is False

    def test_is_expired_after_timeout(self):
        past = datetime.now(UTC) - timedelta(hours=2)
        session = MCPSession.create(
            tenant_id=uuid.uuid4(),
            client_id=uuid.uuid4(),
            client_name="Test",
            timeout_seconds=60,
            now=past,
        )
        assert session.is_expired() is True

    def test_authenticate_transition(self):
        session = MCPSession.create(
            tenant_id=uuid.uuid4(),
            client_id=uuid.uuid4(),
            client_name="Test",
        )
        authed = session.authenticate()
        assert authed.state == MCPSessionState.AUTHENTICATED

    def test_activate_transition(self):
        session = MCPSession.create(
            tenant_id=uuid.uuid4(),
            client_id=uuid.uuid4(),
            client_name="Test",
        )
        active = session.authenticate().activate()
        assert active.state == MCPSessionState.ACTIVE

    def test_disconnect_transition(self):
        session = MCPSession.create(
            tenant_id=uuid.uuid4(),
            client_id=uuid.uuid4(),
            client_name="Test",
        )
        disconnected = session.disconnect()
        assert disconnected.state == MCPSessionState.DISCONNECTED

    def test_touch_extends_expiry(self):
        now = datetime.now(UTC)
        session = MCPSession.create(
            tenant_id=uuid.uuid4(),
            client_id=uuid.uuid4(),
            client_name="Test",
            timeout_seconds=60,
            now=now,
        )
        old_expires = session.expires_at
        touched = session.touch(timeout_seconds=3600, now=now)
        assert touched.expires_at > old_expires
        assert touched.last_activity == now

    def test_authenticate_from_invalid_state_raises(self):
        session = MCPSession.create(
            tenant_id=uuid.uuid4(),
            client_id=uuid.uuid4(),
            client_name="Test",
        )
        disconnected = session.disconnect()
        with pytest.raises(ValidationException):
            disconnected.authenticate()
