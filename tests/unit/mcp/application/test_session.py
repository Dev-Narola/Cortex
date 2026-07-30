"""
Unit tests for MCPSessionService and MCP repositories.
"""

from __future__ import annotations

import uuid

import pytest

from src.mcp.application.session import MCPSessionService
from src.mcp.domain.exceptions import MCPSessionExpired
from src.mcp.domain.value_objects import MCPSessionState, MCPTransport
from src.mcp.infrastructure.repositories import MCPClientRepository, MCPSessionRepository


class TestMCPSessionRepository:
    """Tests for MCPSessionRepository CRUD operations."""

    def test_create_and_get_session(self, db_session, tenant_id):
        svc = MCPSessionService(db_session)
        session = svc.create_session(
            tenant_id=tenant_id,
            client_name="Claude Desktop",
            client_version="1.0.0",
        )
        assert session.tenant_id == tenant_id
        assert session.client_name == "Claude Desktop"
        assert session.state == MCPSessionState.INITIALIZING

    def test_get_active_session(self, db_session, tenant_id):
        svc = MCPSessionService(db_session)
        created = svc.create_session(
            tenant_id=tenant_id, client_name="TestClient",
        )
        # Activate the session
        authed = created.authenticate().activate()
        repo = MCPSessionRepository(db_session)
        repo.update(authed)
        db_session.commit()

        retrieved = svc.get_active_session(
            tenant_id=tenant_id, session_id=authed.id,
        )
        assert retrieved.id == authed.id
        assert retrieved.state == MCPSessionState.ACTIVE

    def test_get_active_session_nonexistent_raises(self, db_session, tenant_id):
        svc = MCPSessionService(db_session)
        with pytest.raises(MCPSessionExpired):
            svc.get_active_session(
                tenant_id=tenant_id, session_id=uuid.uuid4(),
            )

    def test_refresh_session(self, db_session, tenant_id):
        svc = MCPSessionService(db_session)
        created = svc.create_session(
            tenant_id=tenant_id, client_name="TestClient",
        )
        # Activate first
        authed = created.authenticate().activate()
        repo = MCPSessionRepository(db_session)
        repo.update(authed)
        db_session.commit()

        refreshed = svc.refresh_session(
            tenant_id=tenant_id, session_id=authed.id,
        )
        assert refreshed.last_activity >= authed.last_activity

    def test_disconnect_session(self, db_session, tenant_id):
        svc = MCPSessionService(db_session)
        created = svc.create_session(
            tenant_id=tenant_id, client_name="TestClient",
        )
        disconnected = svc.disconnect_session(
            tenant_id=tenant_id, session_id=created.id,
        )
        assert disconnected.state == MCPSessionState.DISCONNECTED

    def test_disconnect_nonexistent_raises(self, db_session, tenant_id):
        svc = MCPSessionService(db_session)
        with pytest.raises(MCPSessionExpired):
            svc.disconnect_session(
                tenant_id=tenant_id, session_id=uuid.uuid4(),
            )


class TestMCPClientRepository:
    """Tests for MCPClientRepository CRUD operations."""

    def test_auto_create_client_on_session(self, db_session, tenant_id):
        svc = MCPSessionService(db_session)
        svc.create_session(tenant_id=tenant_id, client_name="NewClient")

        repo = MCPClientRepository(db_session)
        client = repo.get_by_name(tenant_id=tenant_id, name="NewClient")
        assert client is not None
        assert client.name == "NewClient"

    def test_reuse_existing_client(self, db_session, tenant_id):
        svc = MCPSessionService(db_session)
        svc.create_session(tenant_id=tenant_id, client_name="SameClient")
        svc.create_session(tenant_id=tenant_id, client_name="SameClient")

        repo = MCPClientRepository(db_session)
        client = repo.get_by_name(tenant_id=tenant_id, name="SameClient")
        assert client is not None

    def test_tenant_isolation(self, db_session, tenant_id, second_tenant_id):
        svc = MCPSessionService(db_session)
        svc.create_session(tenant_id=tenant_id, client_name="SharedName")

        repo = MCPClientRepository(db_session)
        assert repo.get_by_name(tenant_id=tenant_id, name="SharedName") is not None
        assert repo.get_by_name(tenant_id=second_tenant_id, name="SharedName") is None
