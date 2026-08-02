"""
MCP Rate Limiter for protecting Cortex resources from external agent quota abuse.
"""

from __future__ import annotations

import logging
import time
import uuid
from typing import Any

from src.mcp.domain.exceptions import MCPException

logger = logging.getLogger(__name__)


class MCPRateLimitExceeded(MCPException):
    """Raised when an external client exceeds its allowed request or tool execution quota."""

    def __init__(self, message: str = "MCP rate limit exceeded", data: dict[str, Any] | None = None) -> None:
        super().__init__(message=message, code=429, data=data)


class MCPRateLimiter:
    """Redis-backed rate limiter enforcing request and tool invocation quotas per tenant/client."""

    def __init__(
        self,
        redis_client: Any | None = None,
        default_limit_per_minute: int = 120,
    ) -> None:
        self._redis = redis_client
        self._default_limit = default_limit_per_minute

    async def check_rate_limit(
        self,
        tenant_id: uuid.UUID,
        client_id: uuid.UUID | str = "default",
        limit: int | None = None,
    ) -> None:
        """Verify request quota under a sliding 60-second window."""
        if self._redis is None:
            return  # Rate limiting gracefully bypassed if Redis is disabled

        max_limit = limit or self._default_limit
        key = f"mcp:ratelimit:{tenant_id}:{client_id}"
        current_time = int(time.time())

        try:
            pipeline = self._redis.pipeline()
            pipeline.zremrangebyscore(key, 0, current_time - 60)
            pipeline.zadd(key, {str(current_time) + ":" + str(uuid.uuid4()): current_time})
            pipeline.zcard(key)
            pipeline.expire(key, 60)
            results = await pipeline.execute()

            request_count = results[2]
            if request_count > max_limit:
                logger.warning(
                    "mcp.rate_limit_exceeded tenant_id=%s client_id=%s count=%d limit=%d",
                    tenant_id,
                    client_id,
                    request_count,
                    max_limit,
                )
                raise MCPRateLimitExceeded(
                    message=f"Rate limit exceeded: {request_count}/{max_limit} requests per minute",
                    data={
                        "tenant_id": str(tenant_id),
                        "client_id": str(client_id),
                        "limit": max_limit,
                        "window_seconds": 60,
                    },
                )
        except MCPRateLimitExceeded:
            raise
        except Exception as exc:
            logger.error("mcp.rate_limiter_error error=%s", exc)


__all__ = ["MCPRateLimitExceeded", "MCPRateLimiter"]
