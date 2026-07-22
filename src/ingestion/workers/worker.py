"""
Arq worker entry point.

Run with:
    python -m arq src.ingestion.workers.worker.WorkerSettings
"""

import logging

from arq.connections import RedisSettings

from src.ingestion.workers.tasks import ingest_document_task
from src.platform.config import settings

logger = logging.getLogger(__name__)


class WorkerSettings:
    """
    Arq worker configuration.

    Retry policy (applies to TransientWorkerErrors that re-raise):
        Attempt 1  → immediate
        Attempt 2  → ~5 s  (backoff_factor=5, multiplier=2^1)
        Attempt 3  → ~30 s (backoff_factor=5, multiplier=2^2)
        Attempt 4  → ~120 s — then permanently failed

    `keep_result` is set to 3600 s (1 h) so result inspection is
    possible without Redis bloat.
    """

    functions = [ingest_document_task]

    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)

    # Concurrency cap — prevents overwhelming DB or S3 during bursts
    max_jobs: int = 10

    # Wall-clock limit per job (5 min is generous for a 10 MB document)
    job_timeout: int = 300

    # Arq retries a job when the coroutine raises an exception
    retry_jobs: bool = True

    # Total number of times a job is attempted (includes the first run)
    max_tries: int = 4

    # How long (seconds) job results are kept in Redis for inspection
    keep_result: int = 3600

    @staticmethod
    async def on_startup(ctx: dict) -> None:
        logging.basicConfig(level=logging.INFO)
        logger.info("Ingestion worker started. Initializing Redis...")
        
        from src.platform.redis_client import init_redis
        await init_redis()

    @staticmethod
    async def on_shutdown(ctx: dict) -> None:
        logger.info("Ingestion worker shutting down. Cleaning up connections...")
        
        from src.platform.redis_client import close_redis
        await close_redis()
        
        from src.platform.database import engine
        engine.dispose()
