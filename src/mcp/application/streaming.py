"""
Streaming and Progress Manager for handling long-running MCP operations and notifications.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, AsyncGenerator

from src.mcp.application.protocol import MCPNotification

logger = logging.getLogger(__name__)


class ProgressManager:
    """Manager for publishing progress notifications to connected clients."""

    def __init__(self) -> None:
        pass

    def create_progress_notification(
        self,
        progress_token: str | int,
        progress: float,
        total: float = 100.0,
        message: str = "",
    ) -> MCPNotification:
        """Construct an MCP notifications/progress notification message."""
        return MCPNotification(
            method="notifications/progress",
            params={
                "progressToken": progress_token,
                "progress": progress,
                "total": total,
                "message": message,
            },
        )


class StreamingManager:
    """Manager for async stream publishing and subscription."""

    def __init__(self) -> None:
        self._queues: dict[str, asyncio.Queue[str | None]] = {}

    def create_stream(self, stream_id: str) -> asyncio.Queue[str | None]:
        queue: asyncio.Queue[str | None] = asyncio.Queue()
        self._queues[stream_id] = queue
        return queue

    async def push_chunk(self, stream_id: str, chunk: str) -> None:
        if stream_id in self._queues:
            await self._queues[stream_id].put(chunk)

    async def end_stream(self, stream_id: str) -> None:
        if stream_id in self._queues:
            await self._queues[stream_id].put(None)

    async def stream_generator(self, stream_id: str) -> AsyncGenerator[str, None]:
        queue = self._queues.get(stream_id)
        if queue is None:
            return

        try:
            while True:
                chunk = await queue.get()
                if chunk is None:
                    break
                yield chunk
        finally:
            self._queues.pop(stream_id, None)


__all__ = ["ProgressManager", "StreamingManager"]
