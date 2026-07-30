"""
Unit tests for MCPMessageRouter — JSON-RPC dispatch and error handling.
"""

from __future__ import annotations

import json
import uuid

import pytest

from src.mcp.application.message_router import MCPMessageRouter


class TestMCPMessageRouter:
    """Tests for the JSON-RPC message router."""

    @pytest.mark.asyncio
    async def test_invalid_json_returns_parse_error(self, db_session, tenant_id, user_id):
        router = MCPMessageRouter(
            db_session, tenant_id=tenant_id, user_id=user_id,
        )
        resp = await router.handle_raw_message("not json{{{")
        parsed = json.loads(resp)
        assert parsed["error"]["code"] == -32700
        assert "Parse error" in parsed["error"]["message"]

    @pytest.mark.asyncio
    async def test_missing_method_returns_invalid_request(self, db_session, tenant_id, user_id):
        router = MCPMessageRouter(
            db_session, tenant_id=tenant_id, user_id=user_id,
        )
        resp = await router.handle_raw_message(json.dumps({"jsonrpc": "2.0", "id": 1}))
        parsed = json.loads(resp)
        assert parsed["error"]["code"] == -32600

    @pytest.mark.asyncio
    async def test_unknown_method_returns_method_not_found(self, db_session, tenant_id, user_id):
        router = MCPMessageRouter(
            db_session, tenant_id=tenant_id, user_id=user_id,
        )
        msg = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "unknown/method"})
        resp = await router.handle_raw_message(msg)
        parsed = json.loads(resp)
        assert parsed["error"] is not None
        assert "not found" in parsed["error"]["message"].lower()

    @pytest.mark.asyncio
    async def test_ping_returns_empty_result(self, db_session, tenant_id, user_id):
        router = MCPMessageRouter(
            db_session, tenant_id=tenant_id, user_id=user_id,
        )
        msg = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "ping"})
        resp = await router.handle_raw_message(msg)
        parsed = json.loads(resp)
        assert parsed["result"] == {}
        assert parsed["error"] is None

    @pytest.mark.asyncio
    async def test_tools_list_returns_tools(self, db_session, tenant_id, user_id):
        router = MCPMessageRouter(
            db_session, tenant_id=tenant_id, user_id=user_id,
        )
        msg = json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
        resp = await router.handle_raw_message(msg)
        parsed = json.loads(resp)
        assert "tools" in parsed["result"]
        tool_names = [t["name"] for t in parsed["result"]["tools"]]
        assert "search_documents" in tool_names

    @pytest.mark.asyncio
    async def test_resources_list_returns_resources(self, db_session, tenant_id, user_id):
        router = MCPMessageRouter(
            db_session, tenant_id=tenant_id, user_id=user_id,
        )
        msg = json.dumps({"jsonrpc": "2.0", "id": 3, "method": "resources/list"})
        resp = await router.handle_raw_message(msg)
        parsed = json.loads(resp)
        assert "resources" in parsed["result"]
        uris = [r["uri"] for r in parsed["result"]["resources"]]
        assert "cortex://tenant/settings" in uris

    @pytest.mark.asyncio
    async def test_prompts_list_returns_prompts(self, db_session, tenant_id, user_id):
        router = MCPMessageRouter(
            db_session, tenant_id=tenant_id, user_id=user_id,
        )
        msg = json.dumps({"jsonrpc": "2.0", "id": 4, "method": "prompts/list"})
        resp = await router.handle_raw_message(msg)
        parsed = json.loads(resp)
        assert "prompts" in parsed["result"]
        names = [p["name"] for p in parsed["result"]["prompts"]]
        assert "summarize_document" in names

    @pytest.mark.asyncio
    async def test_prompts_get_renders_template(self, db_session, tenant_id, user_id):
        router = MCPMessageRouter(
            db_session, tenant_id=tenant_id, user_id=user_id,
        )
        msg = json.dumps({
            "jsonrpc": "2.0",
            "id": 5,
            "method": "prompts/get",
            "params": {
                "name": "summarize_document",
                "arguments": {"document_title": "Test Doc"},
            },
        })
        resp = await router.handle_raw_message(msg)
        parsed = json.loads(resp)
        assert "messages" in parsed["result"]
        assert "Test Doc" in parsed["result"]["messages"][0]["content"]["text"]

    @pytest.mark.asyncio
    async def test_notification_returns_empty_string(self, db_session, tenant_id, user_id):
        router = MCPMessageRouter(
            db_session, tenant_id=tenant_id, user_id=user_id,
        )
        msg = json.dumps({
            "jsonrpc": "2.0",
            "method": "notifications/cancelled",
            "params": {"requestId": "req-1", "reason": "test"},
        })
        resp = await router.handle_raw_message(msg)
        assert resp == ""

    @pytest.mark.asyncio
    async def test_tools_call_missing_required_arg(self, db_session, tenant_id, user_id):
        router = MCPMessageRouter(
            db_session, tenant_id=tenant_id, user_id=user_id,
        )
        msg = json.dumps({
            "jsonrpc": "2.0",
            "id": 6,
            "method": "tools/call",
            "params": {
                "name": "search_documents",
                "arguments": {},
            },
        })
        resp = await router.handle_raw_message(msg)
        parsed = json.loads(resp)
        assert parsed["error"] is not None
