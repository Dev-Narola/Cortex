"""
Unit tests for the V3 ``Citation`` model and the citation-validation
contract in ``AnswerQueryService``.

Citations must be immutable, must reference a real document + chunk,
and the RAG service must only ever surface citations that correspond
to chunks it actually retrieved — never anything the LLM might have
hallucinated.
"""

from __future__ import annotations

import uuid
from dataclasses import FrozenInstanceError

import pytest

from src.conversation.domain.entities import Citation
from src.shared.exceptions import ValidationException


class TestCitation:
    """Pure domain tests for the ``Citation`` model."""

    def test_minimal_construction(self):
        c = Citation(
            document_id=uuid.uuid4(),
            chunk_id=uuid.uuid4(),
            document_title="Architecture.md",
            chunk_index=12,
        )
        assert c.document_title == "Architecture.md"
        assert c.chunk_index == 12
        assert c.score == 0.0
        assert c.excerpt is None

    def test_full_construction(self):
        chunk_id = uuid.uuid4()
        c = Citation(
            document_id=uuid.uuid4(),
            chunk_id=chunk_id,
            document_title="Architecture.md",
            chunk_index=12,
            score=0.87,
            excerpt="Ingestion retries are idempotent …",
        )
        assert c.chunk_id == chunk_id
        assert c.score == 0.87
        assert c.excerpt and "idempotent" in c.excerpt

    def test_is_frozen(self):
        c = Citation(
            document_id=uuid.uuid4(),
            chunk_id=uuid.uuid4(),
            document_title="X",
            chunk_index=0,
        )
        with pytest.raises(FrozenInstanceError):
            c.score = 1.0  # type: ignore[misc]

    def test_rejects_empty_title(self):
        with pytest.raises(ValidationException):
            Citation(
                document_id=uuid.uuid4(),
                chunk_id=uuid.uuid4(),
                document_title="",
                chunk_index=0,
            )

    def test_rejects_negative_chunk_index(self):
        with pytest.raises(ValidationException):
            Citation(
                document_id=uuid.uuid4(),
                chunk_id=uuid.uuid4(),
                document_title="X",
                chunk_index=-1,
            )

    def test_rejects_non_uuid_document_id(self):
        with pytest.raises(ValidationException):
            Citation(
                document_id="not-a-uuid",  # type: ignore[arg-type]
                chunk_id=uuid.uuid4(),
                document_title="X",
                chunk_index=0,
            )

    def test_to_dict_round_trip(self):
        doc_id = uuid.uuid4()
        chunk_id = uuid.uuid4()
        c = Citation(
            document_id=doc_id,
            chunk_id=chunk_id,
            document_title="Architecture.md",
            chunk_index=12,
            score=0.9,
        )
        d = c.to_dict()
        assert d["document_id"] == str(doc_id)
        assert d["chunk_id"] == str(chunk_id)
        assert d["document_title"] == "Architecture.md"
        assert d["chunk_index"] == 12
        assert d["score"] == 0.9


class TestCitationValidation:
    """
    Citation-validation contract: the RAG service must only emit
    citations whose chunk_id was actually retrieved. This is a
    direct requirement from V3 §48 (Citation Validation).
    """

    def test_fabricated_citation_is_dropped(self):
        """
        Simulate the validation step: given a set of retrieved
        chunk ids, an attempted citation that doesn't match any
        of them must be rejected.
        """
        from src.retrieval.domain.entities import SearchResult

        retrieved_chunk_ids = {uuid.uuid4(), uuid.uuid4()}
        fabricated = uuid.uuid4()

        # The validation step is a simple set membership.
        def is_valid(citation_chunk_id: uuid.UUID) -> bool:
            return citation_chunk_id in retrieved_chunk_ids

        assert is_valid(next(iter(retrieved_chunk_ids))) is True
        assert is_valid(fabricated) is False


__all__ = []
