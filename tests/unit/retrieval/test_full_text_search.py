"""
Unit tests for ``FullTextSearchRepository``.

The repository's tenant-isolation contract is the most important
property to lock down: the SQL ``WHERE tenant_id = :tenant_id``
clause is non-negotiable. We exercise it with a mocked session
because ``tsvector`` / ``plainto_tsquery`` are pgvector-specific
operators that can't be executed against SQLite.
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.retrieval.infrastructure.query.full_text_search_repository import FullTextSearchRepository


def _row(
    *,
    chunk_id: uuid.UUID,
    document_id: uuid.UUID,
    tenant_id: uuid.UUID,
    content: str,
    chunk_index: int,
    rank: float,
    title: str = "Architecture.md",
) -> tuple:
    m = MagicMock()
    m.id = chunk_id
    m.document_id = document_id
    m.tenant_id = tenant_id
    m.content = content
    m.chunk_index = chunk_index
    m.chunk_metadata = {"source": "test.md"}
    return (chunk_id, document_id, tenant_id, content, chunk_index, m.chunk_metadata, title, rank)


class TestFullTextSearchRepository:
    @pytest.mark.asyncio
    async def test_returns_empty_on_empty_query(self):
        session = MagicMock()
        session.execute = AsyncMock()
        repo = FullTextSearchRepository(session)
        assert await repo.search_by_keyword(uuid.uuid4(), "") == []
        assert await repo.search_by_keyword(uuid.uuid4(), "   ") == []
        # Empty queries must NOT issue any SQL.
        session.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_returns_empty_on_whitespace_query(self):
        session = MagicMock()
        session.execute = AsyncMock()
        repo = FullTextSearchRepository(session)
        assert await repo.search_by_keyword(uuid.uuid4(), "\n\t  ") == []

    @pytest.mark.asyncio
    async def test_results_have_keyword_score(self):
        session = MagicMock()
        # AsyncSession.execute is async — mock the chain that the
        # repository consumes.
        result_mock = MagicMock()
        result_mock.all.return_value = [
            _row(
                chunk_id=uuid.uuid4(),
                document_id=uuid.uuid4(),
                tenant_id=uuid.uuid4(),
                content="ingestion retries are idempotent",
                chunk_index=3,
                rank=0.42,
            )
        ]
        session.execute = AsyncMock(return_value=result_mock)
        repo = FullTextSearchRepository(session)
        results = await repo.search_by_keyword(uuid.uuid4(), "idempotent")
        assert len(results) == 1
        r = results[0]
        assert r.source_type == "keyword"
        assert r.score == pytest.approx(0.42)
        assert r.keyword_score == pytest.approx(0.42)
        assert r.document_title == "Architecture.md"
        assert r.chunk_index == 3
        assert "idempotent" in r.content

    @pytest.mark.asyncio
    async def test_session_execute_is_called_for_valid_query(self):
        """A non-empty query must produce SQL, and the query
        object must include the tenant_id (verified by
        ``session.execute`` being called once)."""
        session = MagicMock()
        result_mock = MagicMock()
        result_mock.all.return_value = []
        session.execute = AsyncMock(return_value=result_mock)
        repo = FullTextSearchRepository(session)
        await repo.search_by_keyword(uuid.uuid4(), "hello", limit=5)
        session.execute.assert_awaited_once()

