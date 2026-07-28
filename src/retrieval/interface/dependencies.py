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

from src.embedding.infrastructure.providers.openai import OpenAIEmbeddingProvider
from src.core.dependencies import get_async_db
from src.retrieval.application.fusion import ReciprocalRankFusion
from src.retrieval.application.query_embedding import QueryEmbeddingService
from src.retrieval.application.rerank_service import RerankerService
from src.retrieval.application.search_service import HybridSearchService
from src.retrieval.infrastructure.full_text_search import FullTextSearchRepository
from src.retrieval.infrastructure.reranker import IdentityReranker
from src.retrieval.infrastructure.vector_search import VectorSearchRepository


def get_embedding_provider() -> OpenAIEmbeddingProvider:
    """
    Return the embedding provider used by both ingestion and search.

    Both code paths *must* use the same provider so the vector
    space stays comparable — that's the whole point of the
    ``QueryEmbeddingService`` indirection.
    """
    return OpenAIEmbeddingProvider()


def get_query_embedding_service(
    provider: OpenAIEmbeddingProvider = Depends(get_embedding_provider),
) -> QueryEmbeddingService:
    return QueryEmbeddingService(provider=provider)


def get_reranker_service() -> RerankerService:
    """Return the V3 default reranker (a no-op identity ranker)."""
    return RerankerService(provider=IdentityReranker())


def get_hybrid_search_service(
    db: AsyncSession = Depends(get_async_db),
    query_embed: QueryEmbeddingService = Depends(get_query_embedding_service),
    reranker: RerankerService = Depends(get_reranker_service),
) -> HybridSearchService:
    return HybridSearchService(
        query_embed_service=query_embed,
        vector_repo=VectorSearchRepository(db),
        fts_repo=FullTextSearchRepository(db),
        reranker=reranker,
        fusion=ReciprocalRankFusion(),
    )


__all__ = [
    "get_embedding_provider",
    "get_hybrid_search_service",
    "get_query_embedding_service",
    "get_reranker_service",
]
