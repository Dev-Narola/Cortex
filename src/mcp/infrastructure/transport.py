"""
Transport layer implementations for MCP communication (STDIO, HTTP, WebSocket).

Provides transport abstractions for receiving JSON-RPC messages and
transmitting responses/notifications back to external AI clients.
"""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from typing import Any, Callable, Awaitable

from src.mcp.domain.value_objects import MCPTransport


class BaseTransport(ABC):
    """Abstract base class for all MCP transport handlers."""

    def __init__(self, transport_type: MCPTransport) -> None:
        self.transport_type = transport_type
        self._on_message_handler: Callable[[str], Awaitable[str | None]] | None = None

    def on_message(self, handler: Callable[[str], Awaitable[str | None]]) -> None:
        """Register the message processing callback."""
        self._on_message_handler = handler

    @abstractmethod
    async def send_message(self, message: str) -> None:
        """Send a raw text/JSON message over the transport."""

    @abstractmethod
    async def start(self) -> None:
        """Start listening for incoming messages."""

    @abstractmethod
    async def stop(self) -> None:
        """Stop transport listener and clean up resources."""


class HTTPTransport(BaseTransport):
    """HTTP POST / SSE Transport implementation."""

    def __init__(self) -> None:
        super().__init__(MCPTransport.HTTP)
        self._response_queue: list[str] = []

    async def send_message(self, message: str) -> None:
        self._response_queue.append(message)

    async def start(self) -> None:
        pass

    async def stop(self) -> None:
        self._response_queue.clear()

    async def process_payload(self, body_text: str) -> str | None:
        """Process incoming HTTP body and return immediate JSON response."""
        if self._on_message_handler is not None:
            return await self._on_message_handler(body_text)
        return None


class WebSocketTransport(BaseTransport):
    """WebSocket Transport implementation wrapping FastAPI WebSocket."""

    def __init__(self, websocket: Any) -> None:
        super().__init__(MCPTransport.WEBSOCKET)
        self.websocket = websocket
        self._running = False

    async def send_message(self, message: str) -> None:
        await self.websocket.send_text(message)

    async def start(self) -> None:
        self._running = True

    async def stop(self) -> None:
        self._running = False
        try:
            await self.websocket.close()
        except Exception:  # noqa: BLE001
            pass


class StdioTransport(BaseTransport):
    """Standard I/O (STDIO) Transport for CLI / desktop client tools."""

    def __init__(self) -> None:
        super().__init__(MCPTransport.STDIO)
        self._running = False

    async def send_message(self, message: str) -> None:
        import sys

        sys.stdout.write(message + "\n")
        sys.stdout.flush()

    async def start(self) -> None:
        self._running = True

    async def stop(self) -> None:
        self._running = False


__all__ = [
    "BaseTransport",
    "HTTPTransport",
    "StdioTransport",
    "WebSocketTransport",
]
