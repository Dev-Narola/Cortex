"""
MCP Message Router — dispatches JSON-RPC method calls to application services.

This is the core routing layer that maps MCP method names to the
appropriate handler in the Cortex MCP application layer.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy.orm import Session

from src.mcp.application.cancellation import CancellationManager
from src.mcp.application.handshake import MCPHandshakeService
from src.mcp.application.prompt_registry import PromptRegistry
from src.mcp.application.protocol import (
    INTERNAL_ERROR,
    INVALID_PARAMS,
    INVALID_REQUEST,
    METHOD_NOT_FOUND,
    PARSE_ERROR,
    MCPRequest,
    MCPResponse,
)
from src.mcp.application.resource_providers import MCPResourceDispatcher
from src.mcp.application.resource_registry import ResourceRegistry
from src.mcp.application.session import MCPSessionService
from src.mcp.application.tool_executor import ToolExecutionEngine
from src.mcp.application.tool_registry import MCPToolRegistry
from src.mcp.domain.exceptions import (
    MCPAuthenticationError,
    MCPException,
    MCPSessionExpired,
    ResourceAccessDenied,
    ToolExecutionDenied,
)
from src.shared.exceptions import BaseAppException

logger = logging.getLogger(__name__)


class MCPMessageRouter:
    """Routes JSON-RPC messages to the correct MCP handler method."""

    def __init__(
        self,
        db: Session,
        *,
        tenant_id: Any | None = None,
        user_id: Any | None = None,
        user_role: str = "member",
    ) -> None:
        self._db = db
        self._tenant_id = tenant_id
        self._user_id = user_id
        self._user_role = user_role

        self._handshake = MCPHandshakeService(db)
        self._session_service = MCPSessionService(db)
        self._tool_registry = MCPToolRegistry()
        self._tool_executor = ToolExecutionEngine(db, tool_registry=self._tool_registry)
        self._resource_registry = ResourceRegistry()
        self._resource_dispatcher = MCPResourceDispatcher(db)
        self._prompt_registry = PromptRegistry()
        self._cancellation = CancellationManager()

    async def handle_raw_message(self, raw: str) -> str:
        """Parse a raw JSON string, route, and return the response JSON."""
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return MCPResponse.fail(None, PARSE_ERROR, "Parse error: invalid JSON").model_dump_json()

        if not isinstance(data, dict) or "method" not in data:
            return MCPResponse.fail(
                data.get("id") if isinstance(data, dict) else None,
                INVALID_REQUEST,
                "Invalid request: missing 'method' field",
            ).model_dump_json()

        try:
            request = MCPRequest.model_validate(data)
        except Exception:
            return MCPResponse.fail(
                data.get("id"), INVALID_REQUEST, "Invalid JSON-RPC 2.0 request"
            ).model_dump_json()

        response = await self._dispatch(request)
        if request.is_notification():
            return ""
        return response.model_dump_json()

    async def _dispatch(self, request: MCPRequest) -> MCPResponse:
        """Route a parsed MCPRequest to the appropriate handler."""
        method = request.method
        params = request.params or {}

        try:
            handler = self._resolve_handler(method)
            result = await handler(params)
            return MCPResponse.success(request.id, result)
        except (MCPAuthenticationError, MCPSessionExpired) as exc:
            return MCPResponse.fail(request.id, -32001, exc.message, getattr(exc, "data", None))
        except (ToolExecutionDenied, ResourceAccessDenied) as exc:
            return MCPResponse.fail(request.id, -32003, exc.message, getattr(exc, "data", None))
        except MCPException as exc:
            return MCPResponse.fail(request.id, INVALID_PARAMS, exc.message, getattr(exc, "data", None))
        except BaseAppException as exc:
            return MCPResponse.fail(request.id, INTERNAL_ERROR, exc.message, getattr(exc, "data", None))
        except Exception as exc:
            logger.exception("mcp.unhandled_error method=%s", method)
            return MCPResponse.fail(request.id, INTERNAL_ERROR, f"Internal error: {exc}")

    def _resolve_handler(self, method: str):
        """Return the async handler callable for a JSON-RPC method name."""
        handlers = {
            "initialize": self._handle_initialize,
            "ping": self._handle_ping,
            "tools/list": self._handle_tools_list,
            "tools/call": self._handle_tools_call,
            "resources/list": self._handle_resources_list,
            "resources/read": self._handle_resources_read,
            "prompts/list": self._handle_prompts_list,
            "prompts/get": self._handle_prompts_get,
            "notifications/cancelled": self._handle_cancelled,
        }
        handler = handlers.get(method)
        if handler is None:
            raise MCPException(message=f"Method not found: {method}", code=METHOD_NOT_FOUND)
        return handler

    async def _handle_initialize(self, params: dict[str, Any]) -> dict[str, Any]:
        protocol_version = params.get("protocolVersion", "1.0.0")
        client_info = params.get("clientInfo", {})
        return await self._handshake.initialize(
            tenant_id=self._tenant_id,
            protocol_version=protocol_version,
            client_name=client_info.get("name", "unknown"),
            client_version=client_info.get("version", "1.0.0"),
            capabilities=params.get("capabilities"),
        )

    async def _handle_ping(self, params: dict[str, Any]) -> dict[str, Any]:
        return {}

    async def _handle_tools_list(self, params: dict[str, Any]) -> dict[str, Any]:
        return {"tools": self._tool_registry.list_tools(self._user_role)}

    async def _handle_tools_call(self, params: dict[str, Any]) -> dict[str, Any]:
        tool_name = params.get("name", "")
        arguments = params.get("arguments", {})
        return await self._tool_executor.execute_tool(
            tenant_id=self._tenant_id,
            user_id=self._user_id,
            user_role=self._user_role,
            tool_name=tool_name,
            arguments=arguments,
        )

    async def _handle_resources_list(self, params: dict[str, Any]) -> dict[str, Any]:
        return {"resources": self._resource_registry.list_resources()}

    async def _handle_resources_read(self, params: dict[str, Any]) -> dict[str, Any]:
        uri = params.get("uri", "")
        content = self._resource_dispatcher.read_resource(self._tenant_id, uri)
        return {"contents": [content]}

    async def _handle_prompts_list(self, params: dict[str, Any]) -> dict[str, Any]:
        return {"prompts": self._prompt_registry.list_prompts()}

    async def _handle_prompts_get(self, params: dict[str, Any]) -> dict[str, Any]:
        name = params.get("name", "")
        arguments = params.get("arguments", {})
        return self._prompt_registry.render(name, arguments)

    async def _handle_cancelled(self, params: dict[str, Any]) -> dict[str, Any]:
        request_id = str(params.get("requestId", ""))
        reason = params.get("reason", "Client cancelled")
        self._cancellation.cancel_task(request_id, reason)
        return {}


__all__ = ["MCPMessageRouter"]
