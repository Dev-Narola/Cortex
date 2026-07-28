"""
ChunkRepository — persistence-layer operations for the document_chunks table.
"""

from __future__ import annotations

import uuid

from sqlalchemy import delete, insert
from sqlalchemy.orm import Session

from src.ingestion.domain.entities import Chunk
from src.ingestion.infrastructure.models import DocumentChunkModel


class ChunkRepository:
    """
    Persistence-layer operations for the `document_chunks` table.

    Idempotency strategy: delete-then-insert inside the caller's
    transaction. This guarantees that a retry always produces
    exactly one set of chunks — no duplicates, no stale partial sets.
    """

    def __init__(self, session: Session) -> None:
        self._session = session

    def replace_all(
        self,
        chunks: list[Chunk],
        *,
        document_id: uuid.UUID,
        tenant_id: uuid.UUID,
    ) -> int:
        """
        Atomically replace all chunks for a document.

        Steps (within the caller's transaction):
            1. DELETE all existing chunks for (document_id, tenant_id).
            2. INSERT the new chunks.

        This is idempotent: running twice with identical input produces
        the same final state. Running twice with different input
        (e.g. after a config change) replaces the old set cleanly.

        Returns the number of new rows inserted.
        """
        self._delete_all(document_id, tenant_id=tenant_id)

        if not chunks:
            return 0

        rows = [
            {
                "id": chunk.id,
                "document_id": chunk.document_id,
                "tenant_id": chunk.tenant_id,
                "content": chunk.content,
                "chunk_index": chunk.chunk_index,
                "token_count": chunk.token_count,
                "metadata": chunk.metadata,
                "created_at": chunk.created_at,
            }
            for chunk in chunks
        ]
        self._session.execute(insert(DocumentChunkModel), rows)
        self._session.flush()
        return len(rows)

    def _delete_all(self, document_id: uuid.UUID, *, tenant_id: uuid.UUID) -> int:
        from sqlalchemy import CursorResult
        
        stmt = (
            delete(DocumentChunkModel)
            .where(DocumentChunkModel.document_id == document_id)
            .where(DocumentChunkModel.tenant_id == tenant_id)
        )
        result = self._session.execute(stmt)
        if isinstance(result, CursorResult):
            return result.rowcount
        return 0

    def get_unembedded_chunks(
        self,
        document_id: uuid.UUID,
        *,
        tenant_id: uuid.UUID,
        limit: int = 100,
    ) -> list[Chunk]:
        """
        Fetch chunks for a document that do not yet have an embedding.
        Returns up to `limit` chunks ordered by chunk_index.
        """
        from sqlalchemy import select
        
        stmt = (
            select(DocumentChunkModel)
            .where(DocumentChunkModel.document_id == document_id)
            .where(DocumentChunkModel.tenant_id == tenant_id)
            .where(DocumentChunkModel.embedding.is_(None))
            .order_by(DocumentChunkModel.chunk_index.asc())
            .limit(limit)
        )
        
        models = self._session.execute(stmt).scalars().all()
        return [
            Chunk(
                id=m.id,
                document_id=m.document_id,
                tenant_id=m.tenant_id,
                content=m.content,
                chunk_index=m.chunk_index,
                token_count=m.token_count,
                metadata=m.chunk_metadata,
                created_at=m.created_at,
            )
            for m in models
        ]

    def update_chunk_embeddings(
        self,
        document_id: uuid.UUID,
        *,
        tenant_id: uuid.UUID,
        updates: list[dict],
    ) -> None:
        """
        Batch update chunk embeddings.
        `updates` is a list of dicts:
            {
                "id": uuid.UUID,
                "embedding": list[float],
                "embedding_model": str,
                "embedding_version": str,
            }
        """
        from sqlalchemy import update
        
        for u in updates:
            stmt = (
                update(DocumentChunkModel)
                .where(DocumentChunkModel.id == u["id"])
                .where(DocumentChunkModel.document_id == document_id)
                .where(DocumentChunkModel.tenant_id == tenant_id)
                .values(
                    embedding=u["embedding"],
                    embedding_model=u["embedding_model"],
                    embedding_version=u["embedding_version"],
                )
            )
            self._session.execute(stmt)
        self._session.flush()

__all__ = ["ChunkRepository"]
