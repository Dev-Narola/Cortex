"""
Live document-status events.

The ingestion worker publishes every status transition to a per-tenant Redis
channel; the ``/ws/ingestion`` socket subscribes to its tenant's channel and
forwards the messages to the browser (progress bars, status badges).

Message shape matches the frontend parser (``lib/websocket/parseEvent.ts``):
``{"type": "ingestion.status", "document_id", "status", "timestamp"}``.
"""

from __future__ import annotations

import json
import time
import uuid

from src.core.redis_client import get_redis
from src.ingestion.domain.entities import DocumentStatus


def channel(tenant_id: uuid.UUID | str) -> str:
    return f"cortex:ingestion:{tenant_id}"


def status_message(document_id: uuid.UUID | str, status: DocumentStatus | str) -> str:
    return json.dumps(
        {
            "type": "ingestion.status",
            "document_id": str(document_id),
            "status": status.value if isinstance(status, DocumentStatus) else str(status),
            "timestamp": int(time.time() * 1000),
        }
    )


async def publish_status(
    tenant_id: uuid.UUID | str, document_id: uuid.UUID | str, status: DocumentStatus | str
) -> None:
    """Publish one transition. Raises if Redis is unavailable (callers decide)."""
    redis = await get_redis()
    await redis.publish(channel(tenant_id), status_message(document_id, status))
