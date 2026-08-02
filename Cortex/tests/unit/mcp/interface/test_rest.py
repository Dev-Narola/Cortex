"""
Unit tests for MCP REST HTTP endpoint.
"""

from __future__ import annotations

import json
import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.mcp.interface.rest.routes import router


def _make_app() -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    return app


class TestMCPRestEndpoint:
    """Tests for the /api/v1/mcp POST endpoint."""

    def test_missing_auth_returns_401(self):
        app = _make_app()
        client = TestClient(app)

        body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "ping"})
        resp = client.post("/api/v1/mcp", content=body)
        assert resp.status_code == 401
        data = resp.json()
        assert data["error"]["code"] == -32001

    @patch("src.mcp.interface.rest.routes._resolve_auth")
    @patch("src.mcp.interface.rest.routes.MCPMessageRouter")
    def test_valid_request_returns_200(self, mock_router_cls, mock_auth):
        app = _make_app()
        client = TestClient(app)

        mock_auth.return_value = (uuid.uuid4(), uuid.uuid4(), "owner")

        mock_instance = MagicMock()
        mock_instance.handle_raw_message = MagicMock()

        import asyncio

        async def fake_handle(raw):
            return json.dumps({"jsonrpc": "2.0", "id": 1, "result": {}})

        mock_instance.handle_raw_message = fake_handle
        mock_router_cls.return_value = mock_instance

        body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "ping"})
        resp = client.post(
            "/api/v1/mcp",
            content=body,
            headers={"X-API-Key": "ctx_testkey"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["result"] == {}

    @patch("src.mcp.interface.rest.routes._resolve_auth")
    @patch("src.mcp.interface.rest.routes.MCPMessageRouter")
    def test_notification_returns_204(self, mock_router_cls, mock_auth):
        app = _make_app()
        client = TestClient(app)

        mock_auth.return_value = (uuid.uuid4(), uuid.uuid4(), "member")

        mock_instance = MagicMock()

        async def fake_handle(raw):
            return ""

        mock_instance.handle_raw_message = fake_handle
        mock_router_cls.return_value = mock_instance

        body = json.dumps({
            "jsonrpc": "2.0",
            "method": "notifications/cancelled",
            "params": {"requestId": "1"},
        })
        resp = client.post(
            "/api/v1/mcp",
            content=body,
            headers={"X-API-Key": "ctx_testkey"},
        )
        assert resp.status_code == 204
