"""
Unit tests for MCP application services — protocol, registries, session, and message router.
"""

from __future__ import annotations

import json
import uuid
from unittest.mock import MagicMock, patch

import pytest

from src.mcp.application.protocol import (
    INTERNAL_ERROR,
    INVALID_REQUEST,
    METHOD_NOT_FOUND,
    PARSE_ERROR,
    MCPError,
    MCPNotification,
    MCPRequest,
    MCPResponse,
)
from src.mcp.application.registry import CapabilityRegistry
from src.mcp.application.tool_registry import MCPToolDefinition, MCPToolRegistry
from src.mcp.application.resource_registry import MCPResourceDefinition, ResourceRegistry
from src.mcp.application.prompt_registry import (
    MCPPromptArgument,
    MCPPromptDefinition,
    PromptRegistry,
)
from src.mcp.application.streaming import ProgressManager, StreamingManager
from src.mcp.application.cancellation import CancellationManager
from src.mcp.domain.exceptions import ToolExecutionDenied
from src.shared.exceptions import NotFoundException, ValidationException


# --- Protocol models ---


class TestMCPRequest:
    def test_create_request(self):
        req = MCPRequest(method="tools/list", id=1)
        assert req.method == "tools/list"
        assert req.jsonrpc == "2.0"
        assert req.id == 1

    def test_notification_has_no_id(self):
        req = MCPRequest(method="notifications/cancelled", id=None)
        assert req.is_notification() is True

    def test_request_is_not_notification(self):
        req = MCPRequest(method="tools/list", id="abc")
        assert req.is_notification() is False


class TestMCPResponse:
    def test_success_response(self):
        resp = MCPResponse.success(1, {"tools": []})
        assert resp.id == 1
        assert resp.result == {"tools": []}
        assert resp.error is None

    def test_fail_response(self):
        resp = MCPResponse.fail(1, -32600, "Bad request")
        assert resp.id == 1
        assert resp.result is None
        assert resp.error.code == -32600
        assert resp.error.message == "Bad request"


class TestMCPNotification:
    def test_notification_creation(self):
        n = MCPNotification(method="notifications/progress", params={"progress": 50})
        assert n.method == "notifications/progress"
        assert n.params["progress"] == 50


# --- Capability Registry ---


class TestCapabilityRegistry:
    def test_list_server_capabilities(self):
        registry = CapabilityRegistry()
        caps = registry.list_server_capabilities()
        assert "tools" in caps
        assert "resources" in caps
        assert "prompts" in caps

    def test_resolve_capabilities(self):
        registry = CapabilityRegistry()
        resolved = registry.resolve_capabilities()
        assert "tools" in resolved
        assert "resources" in resolved

    def test_supports_valid_capability(self):
        registry = CapabilityRegistry()
        assert registry.supports("tools") is True

    def test_supports_invalid_capability(self):
        registry = CapabilityRegistry()
        with pytest.raises(ValueError):
            registry.supports("nonexistent")


# --- Tool Registry ---


class TestMCPToolRegistry:
    def test_default_tools_registered(self):
        registry = MCPToolRegistry()
        tools = registry.list_tools()
        tool_names = [t["name"] for t in tools]
        assert "search_documents" in tool_names
        assert "retrieve_context" in tool_names
        assert "graph_search" in tool_names
        assert "run_agent" in tool_names

    def test_get_registered_tool(self):
        registry = MCPToolRegistry()
        tool = registry.get("search_documents")
        assert tool.name == "search_documents"
        assert tool.category == "knowledge"

    def test_get_unregistered_tool_raises(self):
        registry = MCPToolRegistry()
        with pytest.raises(ToolExecutionDenied):
            registry.get("nonexistent_tool")

    def test_register_custom_tool(self):
        registry = MCPToolRegistry()
        custom = MCPToolDefinition(
            name="custom_tool",
            description="Custom test tool",
            input_schema={"type": "object"},
        )
        registry.register(custom)
        assert registry.get("custom_tool").name == "custom_tool"

    def test_list_tools_filters_by_role(self):
        registry = MCPToolRegistry()
        # upload_document requires owner/admin, not member
        all_tools = registry.list_tools("owner")
        member_tools = registry.list_tools("viewer")
        owner_names = [t["name"] for t in all_tools]
        assert "upload_document" in owner_names


# --- Resource Registry ---


class TestResourceRegistry:
    def test_default_resources_registered(self):
        registry = ResourceRegistry()
        resources = registry.list_resources()
        uris = [r["uri"] for r in resources]
        assert "cortex://knowledge/document/{id}" in uris
        assert "cortex://graph/entity/{id}" in uris
        assert "cortex://tenant/settings" in uris

    def test_register_custom_resource(self):
        registry = ResourceRegistry()
        custom = MCPResourceDefinition(
            uri_template="cortex://custom/{id}",
            name="Custom Resource",
            description="A custom test resource",
        )
        registry.register(custom)
        resources = registry.list_resources()
        uris = [r["uri"] for r in resources]
        assert "cortex://custom/{id}" in uris


# --- Prompt Registry ---


class TestPromptRegistry:
    def test_default_prompts_registered(self):
        registry = PromptRegistry()
        prompts = registry.list_prompts()
        names = [p["name"] for p in prompts]
        assert "summarize_document" in names
        assert "explain_architecture" in names
        assert "review_code" in names

    def test_get_prompt(self):
        registry = PromptRegistry()
        prompt = registry.get("summarize_document")
        assert prompt.name == "summarize_document"

    def test_get_nonexistent_prompt_raises(self):
        registry = PromptRegistry()
        with pytest.raises(NotFoundException):
            registry.get("nonexistent")

    def test_render_prompt(self):
        registry = PromptRegistry()
        result = registry.render("summarize_document", {"document_title": "Architecture Guide"})
        assert "messages" in result
        assert "Architecture Guide" in result["messages"][0]["content"]["text"]

    def test_render_missing_required_arg_raises(self):
        registry = PromptRegistry()
        with pytest.raises(ValidationException):
            registry.render("summarize_document", {})


# --- Progress Manager ---


class TestProgressManager:
    def test_create_progress_notification(self):
        pm = ProgressManager()
        notif = pm.create_progress_notification("tok1", 50.0, 100.0, "halfway")
        assert notif.method == "notifications/progress"
        assert notif.params["progress"] == 50.0
        assert notif.params["message"] == "halfway"


# --- Streaming Manager ---


class TestStreamingManager:
    @pytest.mark.asyncio
    async def test_create_and_stream(self):
        sm = StreamingManager()
        sm.create_stream("s1")
        await sm.push_chunk("s1", "hello")
        await sm.end_stream("s1")

        chunks = []
        async for chunk in sm.stream_generator("s1"):
            chunks.append(chunk)
        assert chunks == ["hello"]

    @pytest.mark.asyncio
    async def test_stream_nonexistent_id(self):
        sm = StreamingManager()
        chunks = []
        async for chunk in sm.stream_generator("nonexistent"):
            chunks.append(chunk)
        assert chunks == []


# --- Cancellation Manager ---


class TestCancellationManager:
    def test_cancel_nonexistent_returns_false(self):
        cm = CancellationManager()
        assert cm.cancel_task("nonexistent") is False

    def test_is_cancelled_nonexistent(self):
        cm = CancellationManager()
        assert cm.is_cancelled("nonexistent") is False
