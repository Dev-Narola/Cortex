"""
Unit tests for the Document domain entity.

These tests are pure-Python — no DB, no network, no fixtures beyond
resetting any in-process state between tests. They cover:

* the field defaults
* each business rule the entity is required to enforce
* the lifecycle mutators (transitions, bump_version, etc.)
* equality / hashing based on identity (id)
* the V1 rule "an uploaded document cannot be marked indexed
  directly by the upload flow" — this is the load-bearing rule
  for the whole upload → worker → indexed handoff.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest

from src.ingestion.domain.entities import (
    Document,
    DocumentStatus,
    SourceType,
    is_valid_transition,
)
from src.ingestion.domain.exceptions import (
    DocumentStateException,
    InvalidDocumentFieldException,
)
from src.shared.exceptions import ValidationException

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _tenant_id() -> uuid.UUID:
    return uuid.uuid4()


def _user_id() -> uuid.UUID:
    return uuid.uuid4()


def _valid_storage_uri() -> str:
    tenant = _tenant_id()
    doc = uuid.uuid4()
    return f"s3://cortex-documents/{tenant}/{doc}/raw.bin"


def _make_document(**overrides) -> Document:
    """Build a Document with sensible defaults; tests override per field."""
    kwargs = dict(
        tenant_id=_tenant_id(),
        source_type=SourceType.UPLOAD,
        title="Quarterly Report.pdf",
        mime_type="application/pdf",
        created_by=_user_id(),
    )
    kwargs.update(overrides)
    return Document.create(**kwargs)


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


def test_create_document_with_required_fields_only():
    doc = _make_document()

    assert doc.tenant_id is not None
    assert doc.source_type is SourceType.UPLOAD
    assert doc.title == "Quarterly Report.pdf"
    assert doc.mime_type == "application/pdf"
    assert doc.created_by is not None
    assert doc.status is DocumentStatus.PENDING
    assert doc.version == 1
    assert doc.storage_uri is None
    assert isinstance(doc.id, uuid.UUID)
    assert isinstance(doc.created_at, datetime)
    assert doc.created_at.tzinfo is not None


def test_create_document_with_storage_uri():
    uri = _valid_storage_uri()
    doc = _make_document(storage_uri=uri)

    assert doc.storage_uri == uri


def test_storage_uri_is_stripped_of_surrounding_whitespace():
    uri = _valid_storage_uri()
    doc = _make_document(storage_uri=f"  {uri}  ")

    assert doc.storage_uri == uri


def test_mime_type_is_lowercased_and_stripped():
    doc = _make_document(mime_type="  Application/PDF  ")

    assert doc.mime_type == "application/pdf"


def test_title_is_stripped_of_surrounding_whitespace():
    doc = _make_document(title="  Quarterly Report.pdf  ")

    assert doc.title == "Quarterly Report.pdf"


def test_each_document_gets_a_distinct_id():
    a = _make_document()
    b = _make_document()

    assert a.id != b.id


def test_source_type_string_is_coerced_to_enum():
    doc = _make_document(source_type="upload")

    assert doc.source_type is SourceType.UPLOAD


def test_status_string_is_coerced_to_enum():
    doc = _make_document(status="pending")

    assert doc.status is DocumentStatus.PENDING


# ---------------------------------------------------------------------------
# Business rule: title cannot be empty
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("bad_title", ["", "   ", "\t\n"])
def test_title_cannot_be_empty(bad_title):
    with pytest.raises(ValidationException) as exc_info:
        _make_document(title=bad_title)

    assert exc_info.value.message == "Document title cannot be empty."
    assert exc_info.value.data == {"field": "title"}


def test_title_too_long_raises():
    long_title = "x" * (Document._TITLE_MAX_LENGTH + 1)

    with pytest.raises(ValidationException) as exc_info:
        _make_document(title=long_title)

    assert "cannot exceed" in exc_info.value.message
    assert exc_info.value.data["field"] == "title"
    assert exc_info.value.data["max_length"] == Document._TITLE_MAX_LENGTH


# ---------------------------------------------------------------------------
# Business rule: mime_type must be present and in the V1 allowlist
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "bad_mime",
    [
        "",
        "   ",
        "application/zip",
        "image/png",
        "video/mp4",
        "application/octet-stream",
    ],
)
def test_unsupported_mime_type_rejected(bad_mime):
    with pytest.raises(InvalidDocumentFieldException) as exc_info:
        _make_document(mime_type=bad_mime)

    assert exc_info.value.data["field"] == "mime_type"


@pytest.mark.parametrize(
    "good_mime",
    [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
        "text/markdown",
    ],
)
def test_supported_mime_types_accepted(good_mime):
    doc = _make_document(mime_type=good_mime)

    assert doc.mime_type == good_mime


# ---------------------------------------------------------------------------
# Business rule: tenant_id and created_by must be UUIDs
# ---------------------------------------------------------------------------


def test_non_uuid_tenant_id_rejected():
    with pytest.raises(ValidationException) as exc_info:
        _make_document(tenant_id="not-a-uuid")  # type: ignore[arg-type]

    assert exc_info.value.data["field"] == "tenant_id"


def test_non_uuid_created_by_rejected():
    with pytest.raises(ValidationException) as exc_info:
        _make_document(created_by="not-a-uuid")  # type: ignore[arg-type]

    assert exc_info.value.data["field"] == "created_by"


# ---------------------------------------------------------------------------
# Business rule: version >= 1
# ---------------------------------------------------------------------------


def test_version_zero_rejected():
    with pytest.raises(ValidationException) as exc_info:
        _make_document(version=0)

    assert exc_info.value.data["field"] == "version"
    assert exc_info.value.data["min"] == 1


def test_version_negative_rejected():
    with pytest.raises(ValidationException):
        _make_document(version=-3)


def test_non_integer_version_rejected():
    with pytest.raises(ValidationException):
        _make_document(version="1")  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Business rule: source_type must be valid
# ---------------------------------------------------------------------------


def test_invalid_source_type_rejected():
    with pytest.raises(ValidationException) as exc_info:
        _make_document(source_type="ftp")

    assert "Invalid source_type" in exc_info.value.message


# ---------------------------------------------------------------------------
# Business rule: status must be valid
# ---------------------------------------------------------------------------


def test_invalid_status_rejected():
    with pytest.raises(ValidationException) as exc_info:
        _make_document(status="queued")

    assert "Invalid status" in exc_info.value.message


# ---------------------------------------------------------------------------
# Business rule: storage_uri, if present, must be an s3:// URI
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "bad_uri",
    [
        "not-a-uri",
        "https://example.com/file.pdf",
        "s3://",
        "s3:///key",
        "s3://" + "b" * 64 + "/key",  # bucket name too long
        "s3://bucket/" + "x" * 1100,  # key too long (URI > 1024 chars)
    ],
)
def test_invalid_storage_uri_rejected(bad_uri):
    with pytest.raises(InvalidDocumentFieldException) as exc_info:
        _make_document(storage_uri=bad_uri)

    assert exc_info.value.data["field"] == "storage_uri"


def test_empty_storage_uri_is_treated_as_none():
    doc = _make_document(storage_uri="   ")

    assert doc.storage_uri is None


def test_set_storage_uri_after_construction():
    doc = _make_document()
    uri = _valid_storage_uri()

    doc.set_storage_uri(uri)

    assert doc.storage_uri == uri


def test_set_storage_uri_rejects_invalid_value():
    doc = _make_document()

    with pytest.raises(InvalidDocumentFieldException):
        doc.set_storage_uri("not-an-s3-uri")


# ---------------------------------------------------------------------------
# Business rule: created_at must be timezone-aware
# ---------------------------------------------------------------------------


def test_naive_created_at_rejected():
    with pytest.raises(ValidationException) as exc_info:
        Document(
            tenant_id=_tenant_id(),
            source_type=SourceType.UPLOAD,
            title="t",
            mime_type="application/pdf",
            created_by=_user_id(),
            created_at=datetime.now(),  # naive
        )

    assert "timezone-aware" in exc_info.value.message


# ---------------------------------------------------------------------------
# Lifecycle: state machine
# ---------------------------------------------------------------------------


def _walk_to(doc: Document, *path: DocumentStatus) -> None:
    """
    Move `doc` through `path`, one legal transition per step.

    Callers must pass a *path* from the document's current
    status to the target (e.g. `PARSING, CHUNKING, EMBEDDING,
    INDEXED`), not just the destination — each step has to be a
    legal state-machine move, so a one-element call only works
    if the document is already in that state.
    """
    for target in path:
        if target is DocumentStatus.PENDING:
            doc.requeue()
        elif target is DocumentStatus.PARSING:
            doc.mark_parsing()
        elif target is DocumentStatus.CHUNKING:
            doc.mark_chunking()
        elif target is DocumentStatus.EMBEDDING:
            doc.mark_embedding()
        elif target is DocumentStatus.INDEXED:
            doc.mark_indexed()
        elif target is DocumentStatus.FAILED:
            doc.mark_failed()
        else:  # pragma: no cover - defensive
            raise AssertionError(f"Unhandled target status: {target!r}")


def test_happy_path_pending_to_indexed():
    doc = _make_document()
    assert doc.status is DocumentStatus.PENDING

    _walk_to(
        doc,
        DocumentStatus.PARSING,
        DocumentStatus.CHUNKING,
        DocumentStatus.EMBEDDING,
        DocumentStatus.INDEXED,
    )

    assert doc.status is DocumentStatus.INDEXED


def test_v1_rule_uploaded_document_cannot_be_marked_indexed_directly():
    """
    The load-bearing V1 rule: a freshly uploaded document is
    `pending` and cannot reach `indexed` without going through
    parsing → chunking → embedding first. The V1 upload flow only
    has the document in `pending`, so calling `mark_indexed()`
    from the upload path must raise.
    """
    doc = _make_document()
    assert doc.status is DocumentStatus.PENDING

    with pytest.raises(DocumentStateException) as exc_info:
        doc.mark_indexed()

    assert "pending" in exc_info.value.message
    assert "indexed" in exc_info.value.message
    assert exc_info.value.data == {"from": "pending", "to": "indexed"}
    # Status must not have changed.
    assert doc.status is DocumentStatus.PENDING


def test_mark_failed_is_allowed_from_any_non_terminal_state():
    for start in (
        DocumentStatus.PENDING,
        DocumentStatus.PARSING,
        DocumentStatus.CHUNKING,
        DocumentStatus.EMBEDDING,
        DocumentStatus.INDEXED,
    ):
        doc = _make_document(status=start)
        doc.mark_failed()
        assert doc.status is DocumentStatus.FAILED


def test_mark_failed_from_failed_is_rejected():
    doc = _make_document()
    doc.mark_failed()

    with pytest.raises(DocumentStateException):
        doc.mark_failed()


def test_requeue_moves_failed_to_pending():
    doc = _make_document()
    doc.mark_failed()

    doc.requeue()

    assert doc.status is DocumentStatus.PENDING


def test_requeue_from_pending_is_idempotent():
    doc = _make_document()
    assert doc.status is DocumentStatus.PENDING

    doc.requeue()

    assert doc.status is DocumentStatus.PENDING


def test_reprocess_indexed_to_parsing_is_allowed():
    """Reprocess (from the UI) goes indexed → parsing and bumps version."""
    doc = _make_document()
    _walk_to(
        doc,
        DocumentStatus.PARSING,
        DocumentStatus.CHUNKING,
        DocumentStatus.EMBEDDING,
        DocumentStatus.INDEXED,
    )

    doc.bump_version()
    doc.mark_parsing()

    assert doc.status is DocumentStatus.PARSING
    assert doc.version == 2


# Paths used by the parametrize test below. Each path starts at
# `pending` and ends at `from_status`, so the test can re-walk the
# doc to the right starting point for the illegal transition.
_PATHS_TO_STATUS: dict[DocumentStatus, tuple[DocumentStatus, ...]] = {
    DocumentStatus.PARSING: (DocumentStatus.PARSING,),
    DocumentStatus.CHUNKING: (
        DocumentStatus.PARSING,
        DocumentStatus.CHUNKING,
    ),
    DocumentStatus.EMBEDDING: (
        DocumentStatus.PARSING,
        DocumentStatus.CHUNKING,
        DocumentStatus.EMBEDDING,
    ),
    DocumentStatus.INDEXED: (
        DocumentStatus.PARSING,
        DocumentStatus.CHUNKING,
        DocumentStatus.EMBEDDING,
        DocumentStatus.INDEXED,
    ),
}


@pytest.mark.parametrize(
    ("from_status", "to_status"),
    [
        (DocumentStatus.PARSING, DocumentStatus.INDEXED),
        (DocumentStatus.CHUNKING, DocumentStatus.PARSING),
        (DocumentStatus.INDEXED, DocumentStatus.EMBEDDING),
    ],
)
def test_skipping_states_is_rejected(from_status, to_status):
    doc = _make_document()
    _walk_to(doc, *_PATHS_TO_STATUS[from_status])

    with pytest.raises(DocumentStateException):
        if to_status is DocumentStatus.PARSING:
            doc.mark_parsing()
        elif to_status is DocumentStatus.CHUNKING:
            doc.mark_chunking()
        elif to_status is DocumentStatus.EMBEDDING:
            doc.mark_embedding()
        elif to_status is DocumentStatus.INDEXED:
            doc.mark_indexed()


def test_is_valid_transition_helper():
    assert is_valid_transition(DocumentStatus.PENDING, DocumentStatus.PARSING)
    assert is_valid_transition(DocumentStatus.PARSING, DocumentStatus.CHUNKING)
    assert is_valid_transition(DocumentStatus.FAILED, DocumentStatus.PENDING)
    assert not is_valid_transition(DocumentStatus.PENDING, DocumentStatus.INDEXED)
    assert not is_valid_transition(DocumentStatus.INDEXED, DocumentStatus.CHUNKING)


# ---------------------------------------------------------------------------
# Lifecycle: version bumping
# ---------------------------------------------------------------------------


def test_bump_version_increments_by_one():
    doc = _make_document()
    assert doc.version == 1

    doc.bump_version()
    assert doc.version == 2

    doc.bump_version()
    assert doc.version == 3


# ---------------------------------------------------------------------------
# Lifecycle: rename
# ---------------------------------------------------------------------------


def test_rename_updates_title():
    doc = _make_document()

    doc.rename("Annual Report.pdf")

    assert doc.title == "Annual Report.pdf"


def test_rename_validates_new_title():
    doc = _make_document()

    with pytest.raises(ValidationException):
        doc.rename("   ")

    # Original title preserved on failure.
    assert doc.title == "Quarterly Report.pdf"


# ---------------------------------------------------------------------------
# from_persistence: the hydration escape hatch
# ---------------------------------------------------------------------------


def test_from_persistence_skips_transition_check():
    """
    The DB is allowed to hold any state the row was last in,
    including `indexed`. `from_persistence` must not refuse to
    load such a row.
    """
    doc = Document.from_persistence(
        id=uuid.uuid4(),
        tenant_id=_tenant_id(),
        source_type="upload",
        title="loaded",
        storage_uri=None,
        mime_type="application/pdf",
        status="indexed",
        version=3,
        created_by=_user_id(),
        created_at=datetime.now(UTC),
    )

    assert doc.status is DocumentStatus.INDEXED
    assert doc.version == 3


def test_from_persistence_still_validates_individual_fields():
    with pytest.raises(ValidationException):
        Document.from_persistence(
            id=uuid.uuid4(),
            tenant_id=_tenant_id(),
            source_type="upload",
            title="",  # invalid
            storage_uri=None,
            mime_type="application/pdf",
            status="pending",
            version=1,
            created_by=_user_id(),
            created_at=datetime.now(UTC),
        )


# ---------------------------------------------------------------------------
# Equality / hashing
# ---------------------------------------------------------------------------


def test_documents_are_equal_when_ids_match():
    shared_id = uuid.uuid4()
    a = Document(
        id=shared_id,
        tenant_id=_tenant_id(),
        source_type=SourceType.UPLOAD,
        title="A",
        mime_type="application/pdf",
        created_by=_user_id(),
    )
    b = Document(
        id=shared_id,
        tenant_id=uuid.uuid4(),  # different tenant
        source_type=SourceType.UPLOAD,
        title="B",
        mime_type="application/pdf",
        created_by=_user_id(),
    )

    assert a == b
    assert hash(a) == hash(b)


def test_documents_are_not_equal_when_ids_differ():
    a = _make_document()
    b = _make_document()

    assert a != b


def test_documents_can_be_used_in_sets():
    a = _make_document()
    b = _make_document()
    c = _make_document()

    assert len({a, b, c}) == 3
    assert a in {a, b, c}
