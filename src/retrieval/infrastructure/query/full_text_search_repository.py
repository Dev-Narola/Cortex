"""
Async full-text search repository.

Uses Postgres's ``tsvector`` / ``ts_rank`` for BM25-equivalent
keyword scoring. Tenant isolation is enforced at the SQL level.

The ``tsv`` column is populated by a database trigger (see
``alembic/versions/371b75583fd6_add_chunk_vector_columns_and_indices.py``)
that runs ``to_tsvector('english', content)`` on every insert/update,
backed by a GIN index for fast lookup.

Language configuration: hard-coded to ``english`` for V3. ADR-0014
covers the multilingual decision (defer until we have a real need).
"""

from __future__ import annotations

import uuid

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.ingestion.infrastructure.models import DocumentChunkModel, DocumentModel
from src.retrieval.domain.entities import SearchResult


class FullTextSearchRepository:
    """Async Postgres-tsvector adapter for the ``document_chunks`` table."""

    def __init__(
        self,
        session: AsyncSession,
        language: str = "english",
    ) -> None:
        self._session = session
        self._language = language

    async def search_by_keyword(
        self,
        tenant_id: uuid.UUID,
        query: str,
        limit: int = 10,
    ) -> list[SearchResult]:
        if not query or not query.strip():
            return []

        # ``plainto_tsquery`` accepts natural-language input and
        # AND-joins the tokens. ``to_tsquery`` is stricter and
        # requires user-supplied boolean operators; we don't want
        # to expose that surface to API callers in V3.
        ts_query = func.plainto_tsquery(self._language, query)
        rank_col = func.ts_rank(DocumentChunkModel.tsv, ts_query).label("rank")

        stmt = (
            select(
                DocumentChunkModel.id,
                DocumentChunkModel.document_id,
                DocumentChunkModel.tenant_id,
                DocumentChunkModel.content,
                DocumentChunkModel.chunk_index,
                DocumentChunkModel.chunk_metadata,
                DocumentModel.title.label("document_title"),
                rank_col,
            )
            .select_from(
                DocumentChunkModel.__table__.join(
                    DocumentModel.__table__,
                    DocumentModel.id == DocumentChunkModel.document_id,
                    isouter=True,
                )
            )
            .where(DocumentChunkModel.tenant_id == tenant_id)
            .where(DocumentChunkModel.tsv.op("@@")(ts_query))
            .order_by(desc(rank_col))
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
                rank,
            ) = row
            results.append(
                SearchResult(
                    chunk_id=chunk_id,
                    document_id=document_id,
                    tenant_id=row_tenant_id,
                    content=content,
                    score=float(rank),
                    source_type="keyword",
                    document_title=document_title
                    or (chunk_metadata or {}).get("source", ""),
                    chunk_index=chunk_index,
                    metadata=chunk_metadata or {},
                    keyword_score=float(rank),
                )
            )
        return results


__all__ = ["FullTextSearchRepository"]
