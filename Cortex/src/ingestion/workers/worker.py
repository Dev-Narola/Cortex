"""
Arq worker entry point.

Run with:
    python -m arq src.ingestion.workers.worker.WorkerSettings
"""

import logging

from arq.connections import RedisSettings

from src.ingestion.workers.tasks import ingest_document_task, embed_chunks_task
from src.core.config import settings
from src.core.logging import configure_logging
from src.observability.infrastructure.otel import (
    configure_tracing,
    shutdown_tracing,
)

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

    functions = [ingest_document_task, embed_chunks_task]

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
        # --- V4: boot-time observability setup ---
        # ``configure_logging`` is idempotent and replaces
        # the root handler list so the JSON output shape
        # applies to every subsequent log call (including
        # the stdlib ``logger.info`` calls below).
        configure_logging()
        # The worker's tracer provider is distinct from
        # the API's — same SDK, different ``service.name``
        # resource attribute (``cortex-worker``) so the
        # trace backend can group worker spans
        # separately.
        configure_tracing(component="worker")

        logger.info("Ingestion worker started. Initializing Redis...")

        from src.core.redis_client import init_redis
        await init_redis()

    @staticmethod
    async def on_shutdown(ctx: dict) -> None:
        logger.info("Ingestion worker shutting down. Cleaning up connections...")

        from src.core.redis_client import close_redis
        await close_redis()

        from src.core.database import engine
        engine.dispose()

        # Flush any in-flight spans before the worker
        # process exits. Safe to call even if
        # ``configure_tracing`` was somehow not invoked
        # at startup.
        shutdown_tracing()
