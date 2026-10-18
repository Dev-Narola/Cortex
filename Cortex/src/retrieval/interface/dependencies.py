"""
FastAPI dependencies for the retrieval bounded context.

Centralised here (rather than scattered through ``routes.py``) so
test fixtures can override them at the app level via
``app.dependency_overrides[get_hybrid_search_service] = …``.

The default wiring:

* ``QueryEmbeddingService``  → ``OpenAIEmbeddingProvider`` (cached,
                              per-tenant versioned search cache)
* ``VectorSearchRepository`` → async SQLAlchemy session, pgvector
* ``FullTextSearchRepository`` → async SQLAlchemy session, tsvector
* ``RerankerService``        → ``IdentityReranker`` (V3 default; real
                              cross-encoder integration lands in V4)

The async session comes from ``get_async_db``. See ADR-0019 for
why the application layer is async-first in V3+.
"""

from __future__ import annotations

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import settings
from src.core.dependencies import get_async_db
from src.embedding.infrastructure.providers import build_embedding_provider
from src.retrieval.application.query.query_embedding import QueryEmbeddingService
from src.retrieval.application.query.reciprocal_rank_fusion import ReciprocalRankFusion
from src.retrieval.application.query.rerank_service import RerankerService
from src.retrieval.application.search_service import HybridSearchService
from src.retrieval.infrastructure.query.full_text_search_repository import FullTextSearchRepository
from src.retrieval.infrastructure.query.vector_search_repository import VectorSearchRepository
from src.retrieval.infrastructure.reranker import IdentityReranker, LLMReranker


def get_embedding_provider():
    """The embedding provider shared with ingestion (same model = same vector space)."""
    return build_embedding_provider()


def get_query_embedding_service(provider=Depends(get_embedding_provider)) -> QueryEmbeddingService:
    return QueryEmbeddingService(provider=provider)


def get_reranker_service(billable=None) -> RerankerService:
    """``RERANKER_PROVIDER``: ``llm`` (second-pass LLM scoring) or ``identity`` (no-op)."""
    kind = (settings.RERANKER_PROVIDER or "identity").lower()
    if kind == "llm":
        from src.core.dependencies import get_conversation_llm_provider

        return RerankerService(LLMReranker(get_conversation_llm_provider()), billable)
    if kind == "identity":
        return RerankerService(IdentityReranker(), billable)
    raise ValueError(f"unknown RERANKER_PROVIDER: {settings.RERANKER_PROVIDER!r} (llm|identity)")


def build_hybrid_search_service(
    db: AsyncSession,
    *,
    query_embed: QueryEmbeddingService | None = None,
    reranker: RerankerService | None = None,
    billable=None,
) -> HybridSearchService:
    """The one place the search pipeline is assembled (REST search, chat, agents).

    ``billable`` (a ``BillableRecorder``) records provider-reported usage
    for the query embedding and the rerank call; the caller commits it.
    """
    return HybridSearchService(
        query_embed_service=query_embed or QueryEmbeddingService(provider=build_embedding_provider()),
        vector_repo=VectorSearchRepository(db),
        fts_repo=FullTextSearchRepository(db),
        reranker=reranker or get_reranker_service(billable),
        fusion=ReciprocalRankFusion(),
        billable=billable,
    )


def get_hybrid_search_service(
    db: AsyncSession = Depends(get_async_db),
    query_embed: QueryEmbeddingService = Depends(get_query_embedding_service),
    reranker: RerankerService = Depends(get_reranker_service),
) -> HybridSearchService:
    return build_hybrid_search_service(db, query_embed=query_embed, reranker=reranker)


__all__ = [
    "build_hybrid_search_service",
    "get_embedding_provider",
    "get_hybrid_search_service",
    "get_query_embedding_service",
    "get_reranker_service",
]
