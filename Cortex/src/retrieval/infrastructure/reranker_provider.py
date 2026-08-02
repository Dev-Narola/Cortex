from typing import Protocol
from src.retrieval.domain.entities import SearchResult

class RerankerProvider(Protocol):
    """
    Contract for concrete reranker implementations (hosted or local).
    """
    async def get_scores(self, query: str, documents: list[SearchResult]) -> list[float]:
        """Returns relevance scores for the given documents."""
        ...
