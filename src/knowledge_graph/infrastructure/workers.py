"""
Knowledge-Graph extraction worker (V7 — Phase 8).

This module is the *async* path the spec calls out:
graph extraction is fired by a background Arq job
once the document is ``indexed`` (chunks persisted,
embeddings written). The REST handler can still run
extraction synchronously for an on-demand
``POST /api/v1/graph/extract/{document_id}`` request,
but the production path is the worker — the LLM
extraction is slow (multiple seconds per chunk) and
should not block the HTTP response.

The structure mirrors :mod:`src.ingestion.workers`:

* :class:`GraphExtractionTask` — the Arq coroutine
  the queue invokes. It is a thin shell that opens
  a SQLAlchemy session, instantiates the
  extraction services, calls
  :meth:`GraphExtractionPipeline.extract_for_document`,
  and records the metrics.

* :func:`enqueue_graph_extraction` — the helper
  the rest of the application uses to enqueue a
  job. Importing this function is the only thing
  a caller (the ingestion pipeline, an admin
  endpoint, a backfill CLI) needs to know about.

* Error classification (transient vs permanent)
  follows the ingestion convention so the Arq
  retry policy is uniform across the platform.

* The session manager used by the task is the
  :class:`Neo4jSessionManager` seam from
  :mod:`src.knowledge_graph.infrastructure.session`.
  In production this delegates to Postgres; the
  shape is forward-compat with a future Neo4j
  driver.

* Idempotency: the pipeline's dedup pass
  (keyed on ``(tenant_id, name, entity_type)``
  for entities and ``(source, target, type)``
  for relationships) makes the task safe to
  retry. Re-running an extraction never produces
  duplicate rows; it only updates the
  ``updated_at`` on existing entities.
"""

from __future__ import annotations

import logging
import uuid

from arq.connections import ArqRedis

from src.knowledge_graph.application.extraction import GraphExtractionPipeline
from src.knowledge_graph.domain.exceptions import GraphExtractionFailed
from src.knowledge_graph.infrastructure.session import GraphTransactionContext
from src.shared.exceptions import ValidationException

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Arq task
# ---------------------------------------------------------------------------


async def graph_extraction_task(
    ctx: dict,
    document_id: str,
    tenant_id: str,
) -> dict:
    """Run the V7 graph extraction for a single document.

    Parameters
    ----------
    ctx
        The Arq worker context. The worker settings'
        ``on_startup`` populates ``ctx["graph_session_manager"]``
        with the process-wide
        :class:`Neo4jSessionManager` and
        ``ctx["llm_provider"]`` with the configured
        LLM. Tests inject a stub via
        ``ctx["graph_session_manager"] = ...``.
    document_id
        The document whose chunks drive the
        extraction. The document must already be
        in the ``indexed`` state — the chunks and
        embeddings it depends on must be in the
        database.
    tenant_id
        The owning tenant. Every graph row is
        scoped by this id; the spec's defense-in-
        depth tenant-isolation check is enforced
        by :class:`Neo4jSessionManager.transaction`.
    """
    # Resolve the dependencies the worker startup
    # registered. The shape mirrors what
    # ``src.ingestion.workers.tasks`` does.
    session_manager = ctx.get("graph_session_manager")
    llm = ctx.get("llm_provider")
    extraction_provider_factory = ctx.get(
        "graph_extraction_provider_factory"
    )

    # Validate the payload first — a malformed
    # UUID is a permanent failure (Arq should
    # not retry it). The session-manager check
    # comes second because a missing manager
    # means the worker is misconfigured, which
    # is a programming error rather than a
    # retryable job failure.
    try:
        doc_uuid = uuid.UUID(document_id)
        ten_uuid = uuid.UUID(tenant_id)
    except ValueError as exc:
        raise PermanentExtractionError(
            f"invalid uuid in payload: {exc}"
        ) from exc

    if session_manager is None:
        raise RuntimeError(
            "graph_extraction_task requires ctx['graph_session_manager'] "
            "— the worker startup did not wire it."
        )

    # Open the graph transaction with the
    # tenant id bound to the context — every
    # operation through ``txn`` is then
    # auto-scoped. This is the spec's
    # defense-in-depth tenant check.
    with session_manager.transaction(tenant_id=ten_uuid) as txn:
        from src.knowledge_graph.application.extraction import (
            EntityExtractionService,
            OpenAIExtractionProvider,
            RelationshipExtractionService,
        )

        # Build the extraction provider. The
        # factory hook lets the worker use a
        # pre-built LLM (production) or a stub
        # (tests). The default — if no factory is
        # wired — is the OpenAI adapter.
        provider = (
            extraction_provider_factory(llm)
            if extraction_provider_factory is not None
            else OpenAIExtractionProvider(llm=llm)
        )

        entity_svc = EntityExtractionService(provider)
        relationship_svc = RelationshipExtractionService(provider)

        # The pipeline itself opens its own
        # short-lived SQLAlchemy session for the
        # persistence writes; the transaction
        # context is passed in so the call sites
        # share the same unit of work.

        pipeline = GraphExtractionPipeline(
            db=txn.session,
            entity_service=entity_svc,
            relationship_service=relationship_svc,
        )

        # ``extract_for_document`` is async and
        # internally calls the LLM. The Arq
        # coroutine awaits it.
        import asyncio

        result = await pipeline.extract_for_document(
            tenant_id=ten_uuid, document_id=doc_uuid
        )

    return {
        "document_id": document_id,
        "tenant_id": tenant_id,
        "entities_count": len(result.entities),
        "relationships_count": len(result.relationships),
        "metrics": result.metrics.as_dict(),
    }


# ---------------------------------------------------------------------------
# Error categories
# ---------------------------------------------------------------------------


class GraphExtractionWorkerError(Exception):
    """Base class for KG extraction worker errors.

    Mirrors the ingestion convention so the
    worker's error-handling policy is uniform
    across the platform.
    """

    error_code: str = "KG_EXTRACTION_ERROR"

    def __init__(self, message: str, *, original: Exception | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.original = original


class TransientExtractionError(GraphExtractionWorkerError):
    """Temporary failure — safe to retry.

    Examples: LLM provider rate limit, transient
    DB connection drop, temporary network error.
    """

    error_code: str = "KG_EXTRACTION_TRANSIENT"


class PermanentExtractionError(GraphExtractionWorkerError):
    """Unrecoverable failure — do not retry.

    Examples: malformed payload, document does
    not exist, document not yet in ``indexed``
    state.
    """

    error_code: str = "KG_EXTRACTION_PERMANENT"


# Translate the application-layer exceptions
# raised inside the pipeline into the worker
# error categories above. The wrapper is a
# defensive try/except the task body uses to
# re-raise with the right category.


def _classify_exception(exc: Exception) -> GraphExtractionWorkerError:
    """Translate an arbitrary exception into the right worker category.

    The mapping is intentionally conservative —
    unknown exceptions default to
    :class:`TransientExtractionError` so a
    network blip does not lose work.
    """
    if isinstance(exc, (PermanentExtractionError,)):
        return exc
    if isinstance(exc, (ValidationException,)):
        return PermanentExtractionError(
            f"validation failure: {exc.message}",
            original=exc,
        )
    if isinstance(exc, GraphExtractionFailed):
        # The LLM returned malformed JSON / rate
        # limited / etc. These are usually
        # transient — a retry after backoff often
        # succeeds.
        return TransientExtractionError(
            f"graph extraction failed: {exc.message}",
            original=exc,
        )
    # Unknown — keep it transient so a retry
    # can decide.
    return TransientExtractionError(str(exc), original=exc)


# ---------------------------------------------------------------------------
# Enqueue helper
# ---------------------------------------------------------------------------


async def enqueue_graph_extraction(
    redis: ArqRedis,
    *,
    document_id: uuid.UUID,
    tenant_id: uuid.UUID,
    defer_by_seconds: float = 0.0,
) -> str:
    """Enqueue a graph-extraction job for a document.

    The ingestion pipeline calls this once the
    document reaches the ``indexed`` state. The
    function is also the entry point a backfill
    CLI uses.

    Parameters
    ----------
    redis
        The Arq Redis connection. Callers pass
        the app's existing connection (the
        dependency-injection factory exposes it).
    document_id
        The document id. The Arq payload carries
        it as a string because Arq serialises
        payloads through Redis.
    tenant_id
        The owning tenant id. Same.
    defer_by_seconds
        Optional delay (seconds) before the job
        runs. Useful when the ingestion job wants
        to let the embedding step settle first.
    """
    job = await redis.enqueue_job(
        "graph_extraction_task",
        document_id=str(document_id),
        tenant_id=str(tenant_id),
        _defer_by=defer_by_seconds if defer_by_seconds > 0 else None,
    )
    logger.info(
        "graph_extraction.enqueued",
        extra={
            "document_id": str(document_id),
            "tenant_id": str(tenant_id),
            "defer_by_seconds": defer_by_seconds,
            "job_id": job.job_id if job else None,
        },
    )
    return job.job_id if job else ""


__all__ = [
    "GraphExtractionWorkerError",
    "PermanentExtractionError",
    "TransientExtractionError",
    "_classify_exception",
    "enqueue_graph_extraction",
    "graph_extraction_task",
]
