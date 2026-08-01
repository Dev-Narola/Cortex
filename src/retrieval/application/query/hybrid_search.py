"""
Hybrid search service — orchestrates vector + keyword retrieval,
RRF fusion, and optional reranking.

Flow:

    query
      │
      ├──► QueryEmbeddingService.embed_query
      │
      ├──► VectorSearchRepository.search_by_vector
      │
      ├──► FullTextSearchRepository.search_by_keyword
      │
      └──► ReciprocalRankFusion.fuse
              │
              ▼
          (optional) RerankerPort.rerank
              │
              ▼
          SearchResult[]

The async interface matches the rest of V3 (FastAPI handlers,
the RAG service, the WebSocket handler) so callers can ``await``
``search_service.search(...)`` without bridging sync/async.

Caching: an optional Redis-backed result cache is enabled by
default. Cache keys are scoped to the tenant and to a
``tenant_search_version`` (a per-tenant counter that bumps on
data-changing events), so a doc re-upload invalidates the entire
namespace automatically. See ADR-0016 / 0017 for the rationale.
"""

from __future__ import annotations

import hashlib
import json
import logging
import uuid
from typing import Any

from src.core.config import settings
from src.core.redis_client import get_redis
from src.retrieval.application.query.reciprocal_rank_fusion import ReciprocalRankFusion
from src.retrieval.application.query.query_embedding import QueryEmbeddingService
from src.retrieval.application.query.rerank_service import RerankerService
from src.retrieval.domain.entities import SearchResult
from src.retrieval.domain.ports import RerankerPort
from src.retrieval.infrastructure.query.full_text_search_repository import FullTextSearchRepository
from src.retrieval.infrastructure.query.vector_search_repository import VectorSearchRepository

logger = logging.getLogger(__name__)


class HybridSearchService:
    """
    Async, end-to-end hybrid search.

    All collaborators are injected so the service is trivially
    testable with fakes (see ``tests/unit/retrieval/test_fusion.py``
    for the RRF layer; an analogous test exists for the service
    itself in ``tests/integration/retrieval/test_hybrid_search.py``).
    """

    def __init__(
        self,
        query_embed_service: QueryEmbeddingService,
        vector_repo: VectorSearchRepository,
        fts_repo: FullTextSearchRepository,
        reranker: RerankerPort | RerankerService | None = None,
        fusion: ReciprocalRankFusion | None = None,
        vector_top_k: int | None = None,
        keyword_top_k: int | None = None,
        fusion_top_k: int | None = None,
        rerank_top_k: int | None = None,
        final_top_k: int | None = None,
        use_cache: bool = True,
    ) -> None:
        self._query_embed_service = query_embed_service
        self._vector_repo = vector_repo
        self._fts_repo = fts_repo
        # ``RerankerService`` already implements the port (it has
        # an async ``rerank`` method) and is the V3 default
        # application-level adapter. ``RerankerPort`` is the
        # protocol; either is acceptable here.
        self._reranker: RerankerPort | RerankerService | None = reranker
        self._fusion = fusion or ReciprocalRankFusion(k=settings.RRF_K)
        self._vector_top_k = vector_top_k or settings.VECTOR_TOP_K
        self._keyword_top_k = keyword_top_k or settings.KEYWORD_TOP_K
        self._fusion_top_k = fusion_top_k or settings.FUSION_TOP_K
        self._rerank_top_k = rerank_top_k or settings.RERANK_TOP_K
        self._final_top_k = final_top_k or settings.FINAL_TOP_K
        self._use_cache = use_cache

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def search(
        self,
        tenant_id: uuid.UUID,
        query: str,
        *,
        tenant_search_version: int = 0,
        debug: bool = False,
    ) -> list[SearchResult]:
        """
        End-to-end hybrid search.

        ``tenant_search_version`` is included in the cache key so
        data-changing events invalidate the whole tenant's result
        cache without us having to walk keys. ``debug`` is a
        no-op at the service level; the route layer inspects
        ``SearchResult.vector_score``/``keyword_score``/
        ``fusion_score``/``rerank_score`` and decides what to
        surface.
        """
        if not query or not query.strip():
            return []

        # 1) Cache lookup.
        cache_key = self._cache_key(tenant_id, query, tenant_search_version)
        if self._use_cache:
            cached = await self._cache_get(cache_key)
            if cached is not None:
                return self._decode_results(cached)

        # 2) Embed the query (so the same model is used for queries
        #    and documents — see ADR-0014).
        query_vector = await self._query_embed_service.embed_query(query)

        # 3) Run vector and keyword retrieval concurrently-shaped
        #    sequential calls. (The repos are async; using
        #    ``asyncio.gather`` would shave a few ms but for V3
        #    the readability of straight-line code wins.)
        vector_results = await self._vector_repo.search_by_vector(
            tenant_id=tenant_id,
            query_embedding=query_vector,
            limit=self._vector_top_k,
        )
        keyword_results = await self._fts_repo.search_by_keyword(
            tenant_id=tenant_id,
            query=query,
            limit=self._keyword_top_k,
        )

        # 4) RRF fusion.
        fused = self._fusion.fuse(
            vector_results=vector_results,
            keyword_results=keyword_results,
            limit=self._fusion_top_k,
        )

        # 5) Optional reranking, with fallback on failure.
        final: list[SearchResult]
        rerank_succeeded = True
        if self._reranker and fused:
            try:
                # Only rerank the top-``rerank_top_k`` fusion
                # candidates — reranking the whole DB defeats the
                # first-stage retrieval. The remainder of the
                # fused list is appended as a safety net.
                head = fused[: self._rerank_top_k]
                tail = fused[self._rerank_top_k :]
                reranked_head = await self._reranker.rerank(
                    query, head, tenant_id=tenant_id
                )
                # If the application-level RerankerService exposes
                # ``last_rerank_succeeded`` (the V3 default), use it
                # as the authoritative outcome signal — it survives
                # the inner try/except.
                if hasattr(self._reranker, "last_rerank_succeeded"):
                    rerank_succeeded = bool(
                        self._reranker.last_rerank_succeeded
                    )
                final = (reranked_head + tail)[: self._final_top_k]
            except Exception as exc:  # noqa: BLE001 - reranker is best-effort
                logger.warning(
                    "Reranker failed for tenant=%s query=%r: %s. "
                    "Falling back to fused ranking.",
                    tenant_id,
                    query[:60],
                    exc,
                )
                rerank_succeeded = False
                final = fused[: self._final_top_k]
        else:
            final = fused[: self._final_top_k]

        # Attach a flag so the route layer can mention reranker
        # success/fallback in the response when ``debug=True``.
        for r in final:
            r.metadata = dict(r.metadata or {})
            r.metadata.setdefault("_rerank_succeeded", rerank_succeeded)

        # 6) Cache the result payload. We serialise the model
        #    fields, not the dataclass, so the cache survives
        #    domain refactors.
        if self._use_cache:
            await self._cache_set(
                cache_key,
                self._encode_results(final),
                ttl=settings.SEARCH_RESULT_CACHE_TTL_SECONDS,
            )

        return final

    # ------------------------------------------------------------------
    # Cache helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _cache_key(
        tenant_id: uuid.UUID,
        query: str,
        tenant_search_version: int,
    ) -> str:
        """
        Build a per-tenant, versioned cache key.

        Format: ``search:{tenant_id}:v{version}:{sha256(query)}``.

        The hash folds long queries into a fixed-length suffix. The
        tenant_id is in the key *before* the version so different
        tenants can never collide. The version is included so a
        single ``incr`` invalidates everything for a tenant.
        """
        qhash = hashlib.sha256(query.encode("utf-8")).hexdigest()
        return f"search:{tenant_id}:v{tenant_search_version}:{qhash}"

    @staticmethod
    async def _cache_get(key: str) -> Any:
        try:
            redis = await get_redis()
        except RuntimeError:
            return None
        try:
            raw = await redis.get(key)
        except Exception:  # noqa: BLE001
            return None
        if not raw:
            return None
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return None

    @staticmethod
    async def _cache_set(key: str, value: Any, *, ttl: int) -> None:
        try:
            redis = await get_redis()
        except RuntimeError:
            return
        try:
            await redis.set(key, json.dumps(value), ex=ttl)
        except Exception as exc:  # noqa: BLE001
            logger.debug("Search result cache write failed: %s", exc)

    @staticmethod
    def _encode_results(results: list[SearchResult]) -> list[dict]:
        out: list[dict] = []
        for r in results:
            out.append(
                {
                    "chunk_id": str(r.chunk_id),
                    "document_id": str(r.document_id),
                    "tenant_id": str(r.tenant_id),
                    "content": r.content,
                    "score": r.score,
                    "source_type": r.source_type,
                    "document_title": r.document_title,
                    "chunk_index": r.chunk_index,
                    "metadata": r.metadata,
                    "vector_score": r.vector_score,
                    "keyword_score": r.keyword_score,
                    "fusion_score": r.fusion_score,
                    "rerank_score": r.rerank_score,
                }
            )
        return out

    @staticmethod
    def _decode_results(payload: list[dict]) -> list[SearchResult]:
        out: list[SearchResult] = []
        for d in payload:
            out.append(
                SearchResult(
                    chunk_id=uuid.UUID(d["chunk_id"]),
                    document_id=uuid.UUID(d["document_id"]),
                    tenant_id=uuid.UUID(d["tenant_id"]),
                    content=d["content"],
                    score=d["score"],
                    source_type=d["source_type"],
                    document_title=d.get("document_title"),
                    chunk_index=d.get("chunk_index", 0),
                    metadata=d.get("metadata") or {},
                    vector_score=d.get("vector_score", 0.0),
                    keyword_score=d.get("keyword_score", 0.0),
                    fusion_score=d.get("fusion_score", 0.0),
                    rerank_score=d.get("rerank_score", 0.0),
                )
            )
        return out


__all__ = ["HybridSearchService"]

