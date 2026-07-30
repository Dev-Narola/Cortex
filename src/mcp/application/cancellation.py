"""
Cancellation Manager for tracking and aborting long-running MCP tasks.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

logger = logging.getLogger(__name__)


class CancellationManager:
    """Manager tracking running tasks and canceling them upon notifications/cancelled."""

    def __init__(self) -> None:
        self._active_tasks: dict[str, asyncio.Task[Any]] = {}

    def register_task(self, request_id: str, task: asyncio.Task[Any]) -> None:
        """Register a running task with its JSON-RPC request ID."""
        self._active_tasks[request_id] = task

    def unregister_task(self, request_id: str) -> None:
        """Remove task from active tracker."""
        self._active_tasks.pop(request_id, None)

    def cancel_task(self, request_id: str, reason: str = "Client requested cancellation") -> bool:
        """Cancel a running task by request ID."""
        task = self._active_tasks.get(request_id)
        if task is not None and not task.done():
            logger.info("mcp.task_cancelled", extra={"request_id": request_id, "reason": reason})
            task.cancel()
            self._active_tasks.pop(request_id, None)
            return True
        return False

    def is_cancelled(self, request_id: str) -> bool:
        """Check if request ID is marked cancelled or not present."""
        task = self._active_tasks.get(request_id)
        return task.cancelled() if task else False


__all__ = ["CancellationManager"]
