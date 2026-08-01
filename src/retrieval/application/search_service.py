"""
Backward-compatible re-export.

The V9 CQRS split moved the read services under
``src.retrieval.application.query``. This module
re-exports the same symbols under their old
names so existing imports (``from
src.retrieval.application.search_service import
HybridSearchService``) keep working.

The new canonical paths are:

* ``src.retrieval.application.query.hybrid_search.HybridSearchService``
* ``src.retrieval.application.query.reciprocal_rank_fusion.ReciprocalRankFusion``
* ``src.retrieval.application.query.rerank_service.RerankerService``
* ``src.retrieval.application.query.query_embedding.QueryEmbeddingService``
* ``src.retrieval.infrastructure.query.vector_search_repository.VectorSearchRepository``
* ``src.retrieval.infrastructure.query.full_text_search_repository.FullTextSearchRepository``

This shim is the V9 read-side split landing
point. It is *intentionally* a no-op pass-through;
the V9 Part 1 architecture review (see
``docs/architecture/architecture-review.md``)
records the split decision.
"""

from src.retrieval.application.query.hybrid_search import HybridSearchService
from src.retrieval.application.query.query_embedding import (
    QueryEmbeddingService,
)
from src.retrieval.application.query.reciprocal_rank_fusion import (
    ReciprocalRankFusion,
)
from src.retrieval.application.query.rerank_service import RerankerService
from src.retrieval.infrastructure.query.full_text_search_repository import (
    FullTextSearchRepository,
)
from src.retrieval.infrastructure.query.vector_search_repository import (
    VectorSearchRepository,
)

__all__ = [
    "FullTextSearchRepository",
    "HybridSearchService",
    "QueryEmbeddingService",
    "ReciprocalRankFusion",
    "RerankerService",
    "VectorSearchRepository",
]
