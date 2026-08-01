"""
Query embedding service.

Wraps the abstract ``EmbeddingProvider`` port with a method shaped
for the search hot-path (``embed_query``). The application layer
calls this; the underlying provider does whatever it does
(remote API call, local model, cache lookup, …).

**Critical rule:** the same provider instance — and therefore the
same model — must be used for *both* document indexing and query
embedding. If they differ, the vector spaces stop being
comparable and retrieval silently degrades. The
``HybridSearchService`` is wired to receive the same provider
that the ingestion pipeline uses; both come from
``src.ingestion.workers.dependencies.get_embedding_provider``.
"""

from __future__ import annotations

import logging
import uuid

from src.embedding.domain.errors import PermanentEmbeddingError, TransientEmbeddingError
from src.embedding.domain.ports import EmbeddingProvider

logger = logging.getLogger(__name__)


class QueryEmbeddingService:
    """
    Application service for embedding natural-language queries.

    Defers all real work to the injected ``EmbeddingProvider`` so
    the search service never knows whether it's talking to OpenAI,
    Voyage, or a local cross-encoder.
    """

    def __init__(self, provider: EmbeddingProvider) -> None:
        self._provider = provider

    async def embed_query(self, query: str) -> list[float]:
        """
        Embed a search query.

        Raises ``TransientEmbeddingError`` for retryable failures
        (timeouts, 5xx, rate limits) and ``PermanentEmbeddingError``
        for non-retryable ones (auth, bad model, bad input). Both
        are re-raised unchanged so the caller can decide what to
        do (e.g. surface 503 / 400, respectively, at the route
        layer).
        """
        if not query or not query.strip():
            raise PermanentEmbeddingError(
                "Cannot embed an empty or whitespace-only query.",
                code=400,
            )
        try:
            return await self._provider.embed_text(query)
        except (TransientEmbeddingError, PermanentEmbeddingError):
            raise
        except Exception as exc:  # noqa: BLE001 - safety net
            logger.exception("Unexpected error embedding query")
            raise TransientEmbeddingError(
                f"Unexpected provider error: {exc}",
                code=500,
            ) from exc


__all__ = ["QueryEmbeddingService"]

# Re-export the UUID import path so tests that patch the
# signature don't have to reach into ``embedding`` directly.
_ = uuid
