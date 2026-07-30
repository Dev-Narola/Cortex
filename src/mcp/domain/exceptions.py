"""
Domain and application exceptions for the Model Context Protocol (MCP) context.

All exceptions extend the platform exception hierarchy in ``src.shared.exceptions``.
"""

from __future__ import annotations

from typing import Any

from src.shared.exceptions import (
    BaseAppException,
    ForbiddenException,
    NotFoundException,
    UnauthorizedException,
    ValidationException,
)


class MCPException(BaseAppException):
    """Base exception for all MCP-related errors."""

    def __init__(
        self,
        message: str = "MCP protocol error",
        code: int = 400,
        data: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message=message, code=code, data=data)


class MCPAuthenticationError(UnauthorizedException):
    """Raised when an external client fails authentication."""

    def __init__(
        self,
        message: str = "MCP client authentication failed",
        data: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message=message, data=data)


class MCPSessionExpired(UnauthorizedException):
    """Raised when an action is attempted on an expired MCP session."""

    def __init__(
        self,
        message: str = "MCP session has expired or is invalid",
        data: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message=message, data=data)


class UnsupportedProtocolVersion(ValidationException):
    """Raised when an unsupported MCP protocol version is negotiated."""

    def __init__(
        self,
        message: str = "Unsupported MCP protocol version",
        data: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message=message, code=400, data=data)


class UnsupportedCapability(ValidationException):
    """Raised when a client requests an un-negotiated capability."""

    def __init__(
        self,
        message: str = "Unsupported MCP capability",
        data: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message=message, code=400, data=data)


class InvalidTransport(ValidationException):
    """Raised when an invalid transport is specified."""

    def __init__(
        self,
        message: str = "Invalid MCP transport",
        data: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message=message, code=400, data=data)


class InvalidMessage(ValidationException):
    """Raised when a malformed JSON-RPC message is received."""

    def __init__(
        self,
        message: str = "Invalid JSON-RPC 2.0 message",
        data: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message=message, code=400, data=data)


class ToolExecutionDenied(ForbiddenException):
    """Raised when tool execution is denied due to permissions or configuration."""

    def __init__(
        self,
        message: str = "Tool execution denied",
        data: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message=message, data=data)


class ResourceAccessDenied(ForbiddenException):
    """Raised when reading a resource is denied due to multi-tenancy or permissions."""

    def __init__(
        self,
        message: str = "Resource access denied",
        data: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message=message, data=data)


__all__ = [
    "InvalidMessage",
    "InvalidTransport",
    "MCPAuthenticationError",
    "MCPException",
    "MCPSessionExpired",
    "ResourceAccessDenied",
    "ToolExecutionDenied",
    "UnsupportedCapability",
    "UnsupportedProtocolVersion",
]
