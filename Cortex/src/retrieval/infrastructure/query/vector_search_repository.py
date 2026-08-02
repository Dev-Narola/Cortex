"""
Async vector search repository.

Tenant isolation: the ``WHERE tenant_id = :tenant_id`` clause is
non-negotiable. The repository accepts only a ``tenant_id``-scoped
query — there is no overload that omits it. ``SearchResult.score``
is a *similarity* (higher is better); the underlying pgvector
operator is the cosine *distance* (lower is better), and we
convert here.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.ingestion.infrastructure.models import DocumentChunkModel, DocumentModel
from src.retrieval.domain.entities import SearchResult


class VectorSearchRepository:
    """Async pgvector adapter for the ``document_chunks`` table."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def search_by_vector(
        self,
        tenant_id: uuid.UUID,
        query_embedding: list[float],
        limit: int = 10,
    ) -> list[SearchResult]:
        """
        Return the ``limit`` chunks closest to ``query_embedding``,
        for the given tenant, ordered by descending similarity.

        The SELECT joins ``document_chunks`` with ``documents`` so
        the returned ``document_title`` is the real document title,
        not a metadata blob. ``LEFT OUTER JOIN`` is used so a chunk
        whose parent document was somehow deleted (e.g. failed
        cascade) still surfaces — the title just falls back to the
        storage URI from chunk metadata.
        """
        distance_col = DocumentChunkModel.embedding.cosine_distance(
            query_embedding
        ).label("distance")

        stmt = (
            select(
                DocumentChunkModel.id,
                DocumentChunkModel.document_id,
                DocumentChunkModel.tenant_id,
                DocumentChunkModel.content,
                DocumentChunkModel.chunk_index,
                DocumentChunkModel.chunk_metadata,
                DocumentModel.title.label("document_title"),
                distance_col,
            )
            .select_from(
                DocumentChunkModel.__table__.join(
                    DocumentModel.__table__,
                    DocumentModel.id == DocumentChunkModel.document_id,
                    isouter=True,
                )
            )
            .where(DocumentChunkModel.tenant_id == tenant_id)
            .order_by(distance_col.asc())
            .limit(limit)
        )

        rows = (await self._session.execute(stmt)).all()

        results: list[SearchResult] = []
        for row in rows:
            (
                chunk_id,
                document_id,
                row_tenant_id,
                content,
                chunk_index,
                chunk_metadata,
                document_title,
                distance,
            ) = row
            similarity = 1.0 - float(distance)
            results.append(
                SearchResult(
                    chunk_id=chunk_id,
                    document_id=document_id,
                    tenant_id=row_tenant_id,
                    content=content,
                    score=similarity,
                    source_type="vector",
                    document_title=document_title
                    or (chunk_metadata or {}).get("source", ""),
                    chunk_index=chunk_index,
                    metadata=chunk_metadata or {},
                    vector_score=similarity,
                )
            )
        return results


__all__ = ["VectorSearchRepository"]

# Quiesce unused-import warnings — ``Any`` is here for the row type
# hint path used by callers that want to type-narrow manually.
_ = Any
