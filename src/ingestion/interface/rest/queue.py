"""
Arq-backed implementation of QueueClient.

This is the only place in the codebase that imports Arq directly,
keeping the application layer free of the Arq dependency.
"""

from arq import ArqRedis, create_pool
from arq.connections import RedisSettings

from src.ingestion.application.services import QueueClient
from src.core.config import settings


class ArqQueue:
    """
    Concrete QueueClient backed by Arq / Redis.

    The pool is created lazily on the first enqueue call so the app
    can start without Redis being immediately available.
    """

    def __init__(self) -> None:
        self._pool: ArqRedis | None = None

    async def _get_pool(self) -> ArqRedis:
        if self._pool is None:
            self._pool = await create_pool(RedisSettings.from_dsn(settings.REDIS_URL))
        return self._pool

    async def enqueue(self, task_name: str, **kwargs: object) -> None:
        pool = await self._get_pool()
        await pool.enqueue_job(task_name, **kwargs)


# Singleton — one pool shared across all requests
arq_queue = ArqQueue()


def get_arq_queue() -> QueueClient:
    return arq_queue

