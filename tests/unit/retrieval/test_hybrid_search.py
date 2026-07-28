"""
Unit tests for the async ``HybridSearchService``.

Exercises the end-to-end flow with mocked collaborators — no
Postgres, no OpenAI, no Redis. The contract being locked down
is the *flow*: embed query → vector search + keyword search →
RRF fuse → optional rerank → cache write.
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.retrieval.application.fusion import ReciprocalRankFusion
from src.retrieval.application.query_embedding import QueryEmbeddingService
from src.retrieval.application.rerank_service import RerankerService
from src.retrieval.application.search_service import HybridSearchService
from src.retrieval.domain.entities import SearchResult
from src.retrieval.domain.ports import RerankerPort
from src.retrieval.infrastructure.full_text_search import FullTextSearchRepository
from src.retrieval.infrastructure.reranker import IdentityReranker
from src.retrieval.infrastructure.vector_search import VectorSearchRepository


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _result(*, chunk_id: uuid.UUID, score: float, source_type: str) -> SearchResult:
    return SearchResult(
        chunk_id=chunk_id,
        document_id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        content="x",
        score=score,
        source_type=source_type,
        document_title="t",
        chunk_index=0,
    )


def _make_service(
    *,
    vector_results: list[SearchResult] | None = None,
    keyword_results: list[SearchResult] | None = None,
    rerank_raises: bool = False,
) -> HybridSearchService:
    query_embed = MagicMock(spec=QueryEmbeddingService)
    query_embed.embed_query = AsyncMock(return_value=[0.0] * 4)

    vector_repo = MagicMock(spec=VectorSearchRepository)
    vector_repo.search_by_vector = AsyncMock(
        return_value=vector_results if vector_results is not None else []
    )

    fts_repo = MagicMock(spec=FullTextSearchRepository)
    fts_repo.search_by_keyword = AsyncMock(
        return_value=keyword_results if keyword_results is not None else []
    )

    if rerank_raises:
        reranker = MagicMock(spec=RerankerPort)
        reranker.rerank = AsyncMock(side_effect=Exception("boom"))
        rerank_svc = RerankerService(provider=reranker)
    else:
        rerank_svc = RerankerService(provider=IdentityReranker())

    return HybridSearchService(
        query_embed_service=query_embed,
        vector_repo=vector_repo,
        fts_repo=fts_repo,
        reranker=rerank_svc,
        fusion=ReciprocalRankFusion(),
        use_cache=False,
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestHybridSearchFlow:
    @pytest.mark.asyncio
    async def test_empty_query_short_circuits(self):
        service = _make_service()
        assert await service.search(uuid.uuid4(), "") == []
        assert await service.search(uuid.uuid4(), "   ") == []

    @pytest.mark.asyncio
    async def test_fusion_merges_vector_and_keyword(self):
        tenant = uuid.uuid4()
        v_chunk = uuid.uuid4()
        k_chunk = uuid.uuid4()
        service = _make_service(
            vector_results=[
                _result(chunk_id=v_chunk, score=0.9, source_type="vector"),
            ],
            keyword_results=[
                _result(chunk_id=k_chunk, score=0.7, source_type="keyword"),
            ],
        )
        results = await service.search(tenant, "query")
        ids = {r.chunk_id for r in results}
        assert v_chunk in ids
        assert k_chunk in ids

    @pytest.mark.asyncio
    async def test_results_have_fusion_score(self):
        tenant = uuid.uuid4()
        chunk = uuid.uuid4()
        service = _make_service(
            vector_results=[_result(chunk_id=chunk, score=0.9, source_type="vector")],
            keyword_results=[],
        )
        results = await service.search(tenant, "q")
        assert all(r.fusion_score > 0 for r in results)
        # The vector-only entry's rerank_score is set by the
        # identity reranker to its fusion_score.
        assert all(r.rerank_score is not None for r in results)

    @pytest.mark.asyncio
    async def test_rerank_failure_falls_back_to_fused(self):
        """When the reranker raises, the service must log and
        return the fused results — search is resilient to a flaky
        reranker."""
        tenant = uuid.uuid4()
        chunk = uuid.uuid4()
        service = _make_service(
            vector_results=[_result(chunk_id=chunk, score=0.9, source_type="vector")],
            keyword_results=[],
            rerank_raises=True,
        )
        results = await service.search(tenant, "q")
        # The chunk is still returned via the fused (fallback) path.
        assert any(r.chunk_id == chunk for r in results)
        # On rerank failure the metadata flag must be ``False`` so
        # the route layer can surface the degradation.
        assert any(
            (r.metadata or {}).get("_rerank_succeeded") is False for r in results
        ), "Expected _rerank_succeeded=False on at least one result after a rerank failure"


__all__ = []
