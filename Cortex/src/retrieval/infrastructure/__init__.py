"""
Backward-compat re-exports for the V9 retrieval split.

The V9 CQRS work moved the read-side repositories
under :mod:`src.retrieval.infrastructure.query`. The
shims here let existing imports keep working
without a wide-spread rename.

New canonical paths:

* ``src.retrieval.infrastructure.query.vector_search_repository.VectorSearchRepository``
* ``src.retrieval.infrastructure.query.full_text_search_repository.FullTextSearchRepository``
"""

from src.retrieval.infrastructure.query.full_text_search_repository import (
    FullTextSearchRepository,
)
from src.retrieval.infrastructure.query.vector_search_repository import (
    VectorSearchRepository,
)

__all__ = ["FullTextSearchRepository", "VectorSearchRepository"]
