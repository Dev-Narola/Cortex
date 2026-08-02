"""
Reranker concrete implementations.

V3 ships an ``IdentityReranker`` that preserves the fused order.
That's not a "real" reranker — it's the *fallback*. The real
cross-encoder / Cohere Rerank integration lands in V4 once a
concrete hosted provider is in scope (see ADR-0018).

The infrastructure layer holds the actual implementation; the
application layer depends only on the ``RerankerPort`` protocol
defined in ``src.retrieval.domain.ports``.
"""

from __future__ import annotations

import logging

from src.retrieval.domain.entities import SearchResult
from src.retrieval.domain.ports import RerankerPort

logger = logging.getLogger(__name__)


class IdentityReranker(RerankerPort):
    """
    No-op reranker that preserves the fused order.

    Useful as the default when ``RERANKER_PROVIDER`` is unset, and
    as a documented fallback when a real reranker is unavailable.
    Sets ``rerank_score`` to the existing ``fusion_score`` so the
    field is always populated, even when no real cross-encoder
    was involved.
    """

    async def rerank(
        self,
        query: str,
        documents: list[SearchResult],
    ) -> list[SearchResult]:
        for doc in documents:
            doc.rerank_score = doc.fusion_score or doc.score
        return list(documents)


__all__ = ["IdentityReranker"]
