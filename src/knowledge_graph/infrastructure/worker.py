"""
Arq worker entry point for the Knowledge Graph extraction queue.

Run with::

    python -m arq src.knowledge_graph.infrastructure.worker.WorkerSettings

The worker is a separate process from the ingestion
worker. Two reasons:

* Different retry policy. Graph extraction is
  best-effort (a failed extraction does not block
  the document from being served) so the per-job
  timeout and ``max_tries`` are tuned to *not*
  hot-loop the LLM provider.
* Different scale characteristics. A backfill
  job that re-extracts every document in a tenant
  can run for hours; isolating that workload from
  the ingestion path means a long-running
  extraction never starves the embedding step of
  Arq workers.

The structure mirrors :mod:`src.ingestion.workers.worker`:
a single ``WorkerSettings`` class that Arq
introspects at startup, plus ``on_startup`` /
``on_shutdown`` hooks for process-wide setup.
"""

from __future__ import annotations

import logging

from arq.connections import RedisSettings

from src.core.config import settings
from src.core.logging import configure_logging
from src.knowledge_graph.infrastructure.workers import graph_extraction_task
from src.observability.infrastructure.otel import (
    configure_tracing,
    shutdown_tracing,
)

logger = logging.getLogger(__name__)


def _build_graph_session_manager() -> "object":
    """Construct the process-wide :class:`Neo4jSessionManager`.

    Lazy import so the test suite can stub the
    session factory before the worker is
    instantiated. The current production path
    delegates to Postgres via SQLAlchemy; the
    shape is forward-compat with a future Neo4j
    driver.
    """
    from src.knowledge_graph.infrastructure.session import (
        Neo4jSessionManager,
    )
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    engine = create_engine(
        settings.DATABASE_URL,
        pool_pre_ping=True,
    )
    factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return Neo4jSessionManager(
        backend=getattr(settings, "GRAPH_BACKEND", "postgres"),
        session_factory=factory,
    )


class WorkerSettings:
    """Arq worker configuration for the graph extraction queue.

    The class is intentionally separate from
    :class:`src.ingestion.workers.worker.WorkerSettings`
    — they are two separate processes. The
    ``functions`` list registers the graph task;
    the rest of the configuration is the standard
    Arq shape.
    """

    functions = [graph_extraction_task]

    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)

    # Concurrency cap. The graph extraction
    # workload is LLM-bound, not DB-bound, so a
    # higher cap than the ingestion worker is
    # safe — the LLM provider's rate limit is the
    # real ceiling.
    max_jobs: int = 5

    # Per-job wall-clock limit (10 minutes). One
    # document with hundreds of chunks can take a
    # while; the cap is here to keep a stuck job
    # from holding a worker forever.
    job_timeout: int = 600

    # Retry policy. Arq retries the job when the
    # coroutine raises an exception. ``max_tries``
    # is the total attempt count (including the
    # first run).
    retry_jobs: bool = True
    max_tries: int = 3

    # Job results stay in Redis for 1 h so
    # operators can inspect them.
    keep_result: int = 3600

    @staticmethod
    async def on_startup(ctx: dict) -> None:
        """Wire the process-wide collaborators into the worker context.

        The Arq task reads from ``ctx`` rather
        than reaching into module globals; this
        makes the worker testable in isolation
        (tests inject a stub ``Neo4jSessionManager``
        and a stub LLM via ``ctx``).
        """
        configure_logging()
        configure_tracing(component="kg-worker")

        ctx["graph_session_manager"] = _build_graph_session_manager()

        # The LLM provider is wired in lazily
        # because some test environments have no
        # OpenAI key. The production path uses the
        # project's default ``OpenAILLMProvider``.
        try:
            from src.agents.infrastructure.llm_provider import OpenAILLMProvider

            ctx["llm_provider"] = OpenAILLMProvider()
        except Exception:  # noqa: BLE001 - LLM is optional at boot
            logger.warning(
                "graph_worker.llm_provider_unavailable",
                extra={"hint": "OPENAI_API_KEY not set; LLM calls will fail"},
            )
            ctx["llm_provider"] = None

        logger.info(
            "kg_worker.started",
            extra={
                "max_jobs": WorkerSettings.max_jobs,
                "max_tries": WorkerSettings.max_tries,
            },
        )

    @staticmethod
    async def on_shutdown(ctx: dict) -> None:
        """Release the process-wide collaborators."""
        logger.info("kg_worker.shutting_down")
        session_manager = ctx.get("graph_session_manager")
        if session_manager is not None:
            try:
                session_manager.close()
            except Exception:  # noqa: BLE001
                logger.exception("kg_worker.session_manager_close_failed")
        shutdown_tracing()


__all__ = ["WorkerSettings"]
