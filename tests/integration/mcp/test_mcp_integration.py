"""
Integration test verifying end-to-end MCP HTTP requests and multi-tenant isolation.
"""

from __future__ import annotations

import json
import uuid

import pytest
from fastapi.testclient import TestClient

from src.core.dependencies import get_db
from src.identity.infrastructure.security import create_access_token
from src.main import app


class TestMCPIntegration:
    """Integration test suite for MCP server endpoints."""

    def test_full_mcp_lifecycle_over_http(self, db_session, tenant_id, user_id):
        app.dependency_overrides[get_db] = lambda: db_session
        client = TestClient(app)

        token = create_access_token(
            str(user_id),
            extra_claims={"tenant_id": str(tenant_id), "role": "owner"},
        )
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Initialize
        init_req = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "1.0.0",
                "clientInfo": {"name": "TestClient", "version": "1.0.0"},
            },
        }
        resp = client.post("/api/v1/mcp", json=init_req, headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["result"]["serverInfo"]["name"] == "Cortex"

        # 2. List tools
        tools_req = {"jsonrpc": "2.0", "id": 2, "method": "tools/list"}
        resp = client.post("/api/v1/mcp", json=tools_req, headers=headers)
        assert resp.status_code == 200
        tools_data = resp.json()
        tool_names = [t["name"] for t in tools_data["result"]["tools"]]
        assert "search_documents" in tool_names
        assert "retrieve_context" in tool_names

        # 3. List resources
        res_req = {"jsonrpc": "2.0", "id": 3, "method": "resources/list"}
        resp = client.post("/api/v1/mcp", json=res_req, headers=headers)
        assert resp.status_code == 200
        res_data = resp.json()
        uris = [r["uri"] for r in res_data["result"]["resources"]]
        assert "cortex://tenant/settings" in uris
