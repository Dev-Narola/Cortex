"""
Retrieval domain ports (abstract interfaces).

The application layer depends on these protocols, not on the concrete
infrastructure implementations. This keeps the domain free of SQLAlchemy
and any other persistence-layer imports.
"""

from __future__ import annotations

import uuid
from typing import Protocol

from src.retrieval.domain.entities import SearchResult


class VectorSearchPort(Protocol):
    """Contract for vector similarity search."""

    def search_by_vector(
        self,
        tenant_id: uuid.UUID,
        query_embedding: list[float],
        limit: int = 10,
    ) -> list[SearchResult]:
        """
        Return the top-limit chunks closest to query_embedding
        for the given tenant.

        Args:
            tenant_id: Enforced in the WHERE clause — never relaxed.
            query_embedding: Dense vector produced by the embedding model.
            limit: Maximum number of results.

        Returns:
            Results ordered by descending similarity (highest score first).
        """
        ...


class RerankerPort(Protocol):
    """Contract for reranking search results."""

    async def rerank(
        self,
        query: str,
        documents: list[SearchResult]
    ) -> list[SearchResult]:
        """
        Rerank a list of documents based on relevance to the query.

        Args:
            query: The user's query.
            documents: A list of candidate search results.

        Returns:
            The reranked list of documents, with `rerank_score` updated.
        """
        ...
