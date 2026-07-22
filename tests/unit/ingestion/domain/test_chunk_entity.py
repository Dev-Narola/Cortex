"""
Unit tests for the Chunk domain entity.

These tests are pure-Python — no DB, no network, no fixtures beyond
resetting any in-process state between tests. They cover:

* the field defaults
* each business rule the entity is required to enforce
* equality / hashing based on identity (id)
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest

from src.ingestion.domain.entities import Chunk
from src.shared.exceptions import ValidationException

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _tenant_id() -> uuid.UUID:
    return uuid.uuid4()


def _document_id() -> uuid.UUID:
    return uuid.uuid4()


def _make_chunk(**overrides) -> Chunk:
    """Build a Chunk with sensible defaults; tests override per field."""
    kwargs = dict(
        document_id=_document_id(),
        tenant_id=_tenant_id(),
        content="This is a valid chunk of text extracted from a document.",
        chunk_index=0,
        token_count=12,
    )
    kwargs.update(overrides)
    return Chunk.create(**kwargs)


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


def test_create_chunk_with_required_fields_only():
    chunk = _make_chunk()

    assert chunk.document_id is not None
    assert chunk.tenant_id is not None
    assert chunk.content == "This is a valid chunk of text extracted from a document."
    assert chunk.chunk_index == 0
    assert chunk.token_count == 12
    assert chunk.metadata == {}
    assert isinstance(chunk.id, uuid.UUID)
    assert isinstance(chunk.created_at, datetime)
    assert chunk.created_at.tzinfo is not None


def test_create_chunk_with_metadata():
    chunk = _make_chunk(metadata={"source_page": 1})
    assert chunk.metadata == {"source_page": 1}


def test_content_is_stripped_of_surrounding_whitespace():
    chunk = _make_chunk(content="  some content  ")
    assert chunk.content == "some content"


# ---------------------------------------------------------------------------
# Validation: type & constraints
# ---------------------------------------------------------------------------


def test_content_must_be_string():
    with pytest.raises(ValidationException) as exc:
        _make_chunk(content=123)
    assert exc.value.data["field"] == "content"


def test_content_cannot_be_empty():
    with pytest.raises(ValidationException) as exc:
        _make_chunk(content="")
    assert exc.value.data["field"] == "content"


def test_content_cannot_be_whitespace_only():
    with pytest.raises(ValidationException) as exc:
        _make_chunk(content="   \n   ")
    assert exc.value.data["field"] == "content"


def test_document_id_must_be_uuid():
    with pytest.raises(ValidationException) as exc:
        _make_chunk(document_id="not-a-uuid")
    assert exc.value.data["field"] == "document_id"


def test_tenant_id_must_be_uuid():
    with pytest.raises(ValidationException) as exc:
        _make_chunk(tenant_id="not-a-uuid")
    assert exc.value.data["field"] == "tenant_id"


def test_chunk_index_must_be_integer():
    with pytest.raises(ValidationException) as exc:
        _make_chunk(chunk_index="1")
    assert exc.value.data["field"] == "chunk_index"


def test_chunk_index_must_be_non_negative():
    with pytest.raises(ValidationException) as exc:
        _make_chunk(chunk_index=-1)
    assert exc.value.data["field"] == "chunk_index"


def test_token_count_must_be_integer():
    with pytest.raises(ValidationException) as exc:
        _make_chunk(token_count="10")
    assert exc.value.data["field"] == "token_count"


def test_token_count_must_be_non_negative():
    with pytest.raises(ValidationException) as exc:
        _make_chunk(token_count=-5)
    assert exc.value.data["field"] == "token_count"


def test_metadata_must_be_dict():
    with pytest.raises(ValidationException) as exc:
        _make_chunk(metadata="not-a-dict")
    assert exc.value.data["field"] == "metadata"


# ---------------------------------------------------------------------------
# Equality & Hashing
# ---------------------------------------------------------------------------


def test_chunks_are_equal_if_ids_match():
    chunk_id = uuid.uuid4()
    c1 = _make_chunk()
    c1.id = chunk_id
    
    c2 = _make_chunk()
    c2.id = chunk_id
    
    assert c1 == c2


def test_chunks_are_not_equal_if_ids_differ():
    c1 = _make_chunk()
    c2 = _make_chunk()
    assert c1 != c2


def test_chunk_equality_against_other_types():
    c1 = _make_chunk()
    assert c1 != "some_string"
    assert c1 != None


def test_chunks_hash_by_id():
    chunk_id = uuid.uuid4()
    c1 = _make_chunk()
    c1.id = chunk_id
    
    c2 = _make_chunk()
    c2.id = chunk_id
    
    assert hash(c1) == hash(c2)
    assert len({c1, c2}) == 1
