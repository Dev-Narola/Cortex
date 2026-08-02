"""
REST API for the retrieval bounded context.

Endpoints:

* ``POST /search``              — hybrid (vector + keyword) search
* ``POST /search/debug``        — same, but returns the per-stage
                                  scores (vector / keyword / fusion
                                  / rerank) so engineers can see why
                                  each result was selected
* ``GET  /search/health``       — cheap "is retrieval wired up" probe

All endpoints enforce tenant isolation. Authentication is via the
standard JWT bearer dependency (``get_current_user``); API-key auth
is supported for programmatic callers through ``require_api_key``.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.dependencies import get_async_db, get_current_user
from src.retrieval.application.query.reciprocal_rank_fusion import ReciprocalRankFusion
from src.retrieval.application.query.query_embedding import QueryEmbeddingService
from src.retrieval.application.query.rerank_service import RerankerService
from src.retrieval.application.search_service import HybridSearchService
from src.retrieval.domain.entities import SearchResult
from src.retrieval.infrastructure.query.full_text_search_repository import FullTextSearchRepository
from src.retrieval.infrastructure.reranker import IdentityReranker
from src.retrieval.infrastructure.query.vector_search_repository import VectorSearchRepository
from src.retrieval.interface.dependencies import get_hybrid_search_service

router = APIRouter(prefix="/search", tags=["search"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2048)
    limit: int = Field(default=5, ge=1, le=50)


class SearchResultSchema(BaseModel):
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    content: str
    score: float
    document_title: str | None = None
    chunk_index: int
    metadata: dict


class SearchResultDebugSchema(SearchResultSchema):
    """Adds per-stage scores for debugging."""

    vector_score: float = 0.0
    keyword_score: float = 0.0
    fusion_score: float = 0.0
    rerank_score: float = 0.0
    rerank_succeeded: bool = True


class SearchResponse(BaseModel):
    results: list[SearchResultSchema]
    query: str
    tenant_id: uuid.UUID


class SearchDebugResponse(BaseModel):
    results: list[SearchResultDebugSchema]
    query: str
    tenant_id: uuid.UUID
    rerank_succeeded: bool


# ---------------------------------------------------------------------------
# Mapping
# ---------------------------------------------------------------------------


def _to_schema(r: SearchResult, *, debug: bool) -> SearchResultSchema:
    base = SearchResultSchema(
        chunk_id=r.chunk_id,
        document_id=r.document_id,
        content=r.content,
        score=r.score,
        document_title=r.document_title,
        chunk_index=r.chunk_index,
        metadata=r.metadata or {},
    )
    if not debug:
        return base
    rerank_succeeded = bool((r.metadata or {}).get("_rerank_succeeded", True))
    return SearchResultDebugSchema(
        **base.model_dump(),
        vector_score=r.vector_score,
        keyword_score=r.keyword_score,
        fusion_score=r.fusion_score,
        rerank_score=r.rerank_score,
        rerank_succeeded=rerank_succeeded,
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=SearchResponse,
    summary="Hybrid (vector + keyword) search over the tenant's documents",
)
async def search(
    payload: SearchRequest,
    user_tenant: tuple[Any, Any] = Depends(get_current_user),
    search_service: HybridSearchService = Depends(get_hybrid_search_service),
) -> SearchResponse:
    """
    Run a hybrid search for the current tenant.

    Combines pgvector cosine similarity and Postgres full-text
    search, fuses them with RRF, and (if configured) reranks the
    top candidates. See ``src/retrieval/application/search_service.py``
    for the full pipeline.
    """
    _, tenant = user_tenant
    results = await search_service.search(
        tenant_id=tenant.id,
        query=payload.query,
    )
    return SearchResponse(
        results=[_to_schema(r, debug=False) for r in results[: payload.limit]],
        query=payload.query,
        tenant_id=tenant.id,
    )


@router.post(
    "/debug",
    response_model=SearchDebugResponse,
    summary="Hybrid search with per-stage scores (vector / keyword / fusion / rerank)",
)
async def search_debug(
    payload: SearchRequest,
    user_tenant: tuple[Any, Any] = Depends(get_current_user),
    search_service: HybridSearchService = Depends(get_hybrid_search_service),
) -> SearchDebugResponse:
    """
    Debug variant of ``POST /search``.

    Exposes the per-stage scores so engineers can see *why* each
    result was selected. Should not be exposed in production to
    non-admin callers; a real deployment would gate this behind
    an ``owner`` role check.
    """
    _, tenant = user_tenant
    results = await search_service.search(
        tenant_id=tenant.id,
        query=payload.query,
        debug=True,
    )
    rerank_succeeded = all(
        bool((r.metadata or {}).get("_rerank_succeeded", True)) for r in results
    )
    return SearchDebugResponse(
        results=[_to_schema(r, debug=True) for r in results[: payload.limit]],
        query=payload.query,
        tenant_id=tenant.id,
        rerank_succeeded=rerank_succeeded,
    )


@router.get("/health", summary="Cheap retrieval-system probe")
async def search_health() -> dict:
    """Indicates whether the retrieval module is importable. Used by ops."""
    return {"status": "ok", "module": "retrieval"}


# Re-export so test code can override at the app level.
__all__ = ["router", "get_hybrid_search_service", "get_async_db"]


# Quiet type-checker lints about symbols only re-exported for tests.
_ = (
    Query,
    AsyncSession,
    QueryEmbeddingService,
    IdentityReranker,
    ReciprocalRankFusion,
    RerankerService,
    VectorSearchRepository,
    FullTextSearchRepository,
)

