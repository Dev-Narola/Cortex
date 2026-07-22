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


__all__ = ["ChunkRepository"]
