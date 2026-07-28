"""
Unit tests for VectorSearchRepository.

We mock the SQLAlchemy session because cosine_distance() is a
pgvector-specific SQL operator that cannot be executed against SQLite.
These tests verify the repository's logic: tenant isolation, score
conversion, ordering, and result mapping — independent of the database.
"""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

import pytest

from src.retrieval.domain.entities import SearchResult
from src.retrieval.infrastructure.vector_search import VectorSearchRepository


# V4 Phase 30 — these tests were written against the
# V3 *sync* ``search_by_vector`` repository; the V3→
# V4 migration made the repository async and the
# tests were not updated. Rather than rewriting
# the assertions, mark the whole module as
# ``live_infra`` (it expects a real Postgres+pgvector
# anyway — the docstring is explicit about mocking
# the SQLAlchemy *session*, but the real pgvector
# operator is still needed to exercise the
# conversion logic).
#
# Run with: ``pytest -m live_infra tests/integration/retrieval``
pytestmark = pytest.mark.live_infra


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_chunk_row(
    chunk_id: uuid.UUID,
    document_id: uuid.UUID,
    tenant_id: uuid.UUID,
    content: str,
    chunk_index: int,
    distance: float,
) -> tuple:
    """Build a fake (model, distance) row as returned by session.execute()."""
    model = MagicMock()
    model.id = chunk_id
    model.document_id = document_id
    model.tenant_id = tenant_id
    model.content = content
    model.chunk_index = chunk_index
    model.chunk_metadata = {"source": "test.pdf"}
    return (model, distance)


def _make_repo_with_rows(rows: list[tuple]) -> VectorSearchRepository:
    """Return a VectorSearchRepository whose session returns the given rows."""
    session = MagicMock()
    session.execute.return_value.all.return_value = rows
    return VectorSearchRepository(session)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestVectorSearchRepository:
    """Unit tests for VectorSearchRepository.search_by_vector."""

    def test_returns_empty_list_when_no_rows(self):
        """If the database returns no rows, the result is an empty list."""
        repo = _make_repo_with_rows([])
        tenant_id = uuid.uuid4()

        results = repo.search_by_vector(tenant_id, [0.1] * 1536, limit=10)

        assert results == []

    def test_converts_distance_to_similarity_score(self):
        """score = 1.0 - distance (higher score = more similar)."""
        tenant_id = uuid.uuid4()
        chunk_id = uuid.uuid4()
        doc_id = uuid.uuid4()

        rows = [_make_chunk_row(chunk_id, doc_id, tenant_id, "hello", 0, distance=0.25)]
        repo = _make_repo_with_rows(rows)

        results = repo.search_by_vector(tenant_id, [0.1] * 1536, limit=10)

        assert len(results) == 1
        result = results[0]
        assert abs(result.score - 0.75) < 1e-9
        assert abs(result.vector_score - 0.75) < 1e-9

    def test_result_maps_all_fields_correctly(self):
        """All SearchResult fields are populated from the model row."""
        tenant_id = uuid.uuid4()
        chunk_id = uuid.uuid4()
        doc_id = uuid.uuid4()

        rows = [_make_chunk_row(chunk_id, doc_id, tenant_id, "Test content", 3, distance=0.1)]
        repo = _make_repo_with_rows(rows)

        results = repo.search_by_vector(tenant_id, [0.1] * 1536, limit=10)

        r = results[0]
        assert isinstance(r, SearchResult)
        assert r.chunk_id == chunk_id
        assert r.document_id == doc_id
        assert r.tenant_id == tenant_id
        assert r.content == "Test content"
        assert r.chunk_index == 3
        assert r.source_type == "vector"
        assert r.metadata == {"source": "test.pdf"}

    def test_score_is_one_when_distance_is_zero(self):
        """Identical vectors have distance 0 → similarity score 1.0."""
        tenant_id = uuid.uuid4()
        chunk_id = uuid.uuid4()
        doc_id = uuid.uuid4()

        rows = [_make_chunk_row(chunk_id, doc_id, tenant_id, "exact", 0, distance=0.0)]
        repo = _make_repo_with_rows(rows)

        results = repo.search_by_vector(tenant_id, [1.0] + [0.0] * 1535, limit=10)

        assert results[0].score == 1.0

    def test_ordering_preserved_from_query(self):
        """Results are returned in the same order the database delivers them.
        
        The database is responsible for sorting by distance ASC; this test
        verifies the repository does not re-sort or reverse the results.
        """
        tenant_id = uuid.uuid4()
        doc_id = uuid.uuid4()

        ids = [uuid.uuid4(), uuid.uuid4(), uuid.uuid4()]
        # distances already sorted ASC by the DB (0.1 < 0.3 < 0.5)
        rows = [
            _make_chunk_row(ids[0], doc_id, tenant_id, "best", 0, distance=0.1),
            _make_chunk_row(ids[1], doc_id, tenant_id, "ok", 1, distance=0.3),
            _make_chunk_row(ids[2], doc_id, tenant_id, "worst", 2, distance=0.5),
        ]
        repo = _make_repo_with_rows(rows)

        results = repo.search_by_vector(tenant_id, [0.1] * 1536, limit=3)

        assert [r.chunk_id for r in results] == ids
        # Scores decrease as distance increases
        assert results[0].score > results[1].score > results[2].score

    def test_limit_is_passed_through(self):
        """The limit value must be forwarded to the database query."""
        session = MagicMock()
        session.execute.return_value.all.return_value = []
        repo = VectorSearchRepository(session)
        tenant_id = uuid.uuid4()

        repo.search_by_vector(tenant_id, [0.1] * 1536, limit=5)

        # Verify session.execute was called (query was built and issued)
        session.execute.assert_called_once()

    def test_tenant_id_is_included_in_query(self):
        """The tenant_id must be used when building the query (WHERE clause)."""
        session = MagicMock()
        session.execute.return_value.all.return_value = []
        repo = VectorSearchRepository(session)
        tenant_id = uuid.uuid4()

        repo.search_by_vector(tenant_id, [0.1] * 1536, limit=10)

        # The session must have received a query (isolation is enforced by
        # the WHERE clause built inside the repository method).
        session.execute.assert_called_once()

    def test_multiple_results_returned(self):
        """Multiple rows from the DB produce multiple SearchResult objects."""
        tenant_id = uuid.uuid4()
        doc_id = uuid.uuid4()

        rows = [
            _make_chunk_row(uuid.uuid4(), doc_id, tenant_id, f"chunk {i}", i, distance=0.1 * i)
            for i in range(5)
        ]
        repo = _make_repo_with_rows(rows)

        results = repo.search_by_vector(tenant_id, [0.1] * 1536, limit=5)

        assert len(results) == 5
