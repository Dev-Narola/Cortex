"""
JSON-RPC 2.0 protocol models for the Model Context Protocol (MCP).

Per the MCP spec, messages are standard JSON-RPC 2.0 requests, responses,
notifications, and structured errors.
"""

from __future__ import annotations

from typing import Any
from pydantic import BaseModel, Field


class MCPError(BaseModel):
    """JSON-RPC 2.0 error object."""

    code: int
    message: str
    data: Any | None = None


class MCPRequest(BaseModel):
    """JSON-RPC 2.0 Request message."""

    jsonrpc: str = Field(default="2.0")
    id: str | int | None = None
    method: str
    params: dict[str, Any] | None = None

    def is_notification(self) -> bool:
        return self.id is None


class MCPResponse(BaseModel):
    """JSON-RPC 2.0 Response message."""

    jsonrpc: str = Field(default="2.0")
    id: str | int | None = None
    result: Any | None = None
    error: MCPError | None = None

    @classmethod
    def success(cls, id: str | int | None, result: Any) -> MCPResponse:
        return cls(id=id, result=result, error=None)

    @classmethod
    def fail(cls, id: str | int | None, code: int, message: str, data: Any | None = None) -> MCPResponse:
        return cls(id=id, result=None, error=MCPError(code=code, message=message, data=data))


class MCPNotification(BaseModel):
    """JSON-RPC 2.0 Notification message (no request ID)."""

    jsonrpc: str = Field(default="2.0")
    method: str
    params: dict[str, Any] | None = None


# --- Standard JSON-RPC Error Codes ---
PARSE_ERROR = -32700
INVALID_REQUEST = -32600
METHOD_NOT_FOUND = -32601
INVALID_PARAMS = -32602
INTERNAL_ERROR = -32603

# --- MCP Custom Error Codes ---
AUTH_ERROR = -32001
SESSION_EXPIRED = -32002
TOOL_DENIED = -32003
RESOURCE_DENIED = -32004


__all__ = [
    "AUTH_ERROR",
    "INTERNAL_ERROR",
    "INVALID_PARAMS",
    "INVALID_REQUEST",
    "METHOD_NOT_FOUND",
    "MCPError",
    "MCPNotification",
    "MCPRequest",
    "MCPResponse",
    "PARSE_ERROR",
    "RESOURCE_DENIED",
    "SESSION_EXPIRED",
    "TOOL_DENIED",
]
