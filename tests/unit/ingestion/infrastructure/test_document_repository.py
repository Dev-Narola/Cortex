"""
Unit tests for the ingestion repositories (SQLite-backed).

The headline property under test is tenant isolation: every method
that looks up a document must require a `tenant_id`, and a query
with the wrong tenant must return `None` / `False` rather than
returning the cross-tenant row.
"""

from __future__ import annotations

import uuid

import pytest

from src.ingestion.domain.entities import (
    Document,
    DocumentStatus,
    SourceType,
)
from src.ingestion.infrastructure.models import DocumentModel
from src.ingestion.infrastructure.repositories import DocumentRepository


def _storage_uri(tenant_id: uuid.UUID, document_id: uuid.UUID) -> str:
    return f"s3://cortex-documents/{tenant_id}/{document_id}/raw.bin"


def _make_document(tenant_id: uuid.UUID, user_id: uuid.UUID, **overrides) -> Document:
    kwargs = dict(
        tenant_id=tenant_id,
        source_type=SourceType.UPLOAD,
        title=f"Doc-{uuid.uuid4().hex[:6]}.pdf",
        mime_type="application/pdf",
        created_by=user_id,
    )
    kwargs.update(overrides)
    return Document.create(**kwargs)


# ---------------------------------------------------------------------------
# create / read
# ---------------------------------------------------------------------------


def test_repo_create_persists_row(db_session, make_tenant):
    tenant, user = make_tenant()
    doc = _make_document(tenant.id, user.id)

    saved = DocumentRepository(db_session).create(doc)
    db_session.commit()

    assert saved.id == doc.id
    row = db_session.get(DocumentModel, saved.id)
    assert row is not None
    assert row.tenant_id == tenant.id
    assert row.title == doc.title
    assert row.status == "pending"
    assert row.version == 1
    assert row.source_type == "upload"
    assert row.mime_type == "application/pdf"


def test_repo_get_by_id_tenant_scoped(db_session, make_tenant):
    (t1, u1), (t2, _u2) = make_tenant(), make_tenant()
    doc = DocumentRepository(db_session).create(_make_document(t1.id, u1.id))
    db_session.commit()

    repo = DocumentRepository(db_session)
    assert repo.get_by_id(doc.id, tenant_id=t1.id) is not None
    # Same id, wrong tenant -> None (tenant isolation).
    assert repo.get_by_id(doc.id, tenant_id=t2.id) is None


def test_repo_get_by_id_missing_returns_none(db_session, make_tenant):
    tenant, _ = make_tenant()

    assert DocumentRepository(db_session).get_by_id(uuid.uuid4(), tenant_id=tenant.id) is None


def test_repo_create_then_get_round_trips_storage_uri(db_session, make_tenant):
    tenant, user = make_tenant()
    doc = _make_document(tenant.id, user.id)
    uri = _storage_uri(tenant.id, doc.id)
    doc.set_storage_uri(uri)

    saved = DocumentRepository(db_session).create(doc)
    db_session.commit()

    found = DocumentRepository(db_session).get_by_id(saved.id, tenant_id=tenant.id)
    assert found is not None
    assert found.storage_uri == uri


# ---------------------------------------------------------------------------
# list
# ---------------------------------------------------------------------------


def test_repo_list_returns_only_tenant_documents(db_session, make_tenant):
    t1, u1 = make_tenant()
    t2, u2 = make_tenant()
    repo = DocumentRepository(db_session)

    for _ in range(3):
        repo.create(_make_document(t1.id, u1.id))
    repo.create(_make_document(t2.id, u2.id))
    db_session.commit()

    listed = list(repo.list(t1.id))
    assert len(listed) == 3
    for d in listed:
        assert d.tenant_id == t1.id


def test_repo_list_orders_newest_first(db_session, make_tenant):
    tenant, user = make_tenant()
    repo = DocumentRepository(db_session)

    first = repo.create(_make_document(tenant.id, user.id, title="first"))
    db_session.commit()
    second = repo.create(_make_document(tenant.id, user.id, title="second"))
    db_session.commit()

    listed = list(repo.list(tenant.id, limit=10))
    assert [d.id for d in listed] == [second.id, first.id]


def test_repo_list_pagination(db_session, make_tenant):
    tenant, user = make_tenant()
    repo = DocumentRepository(db_session)

    for i in range(5):
        repo.create(_make_document(tenant.id, user.id, title=f"d{i}"))
    db_session.commit()

    page1 = list(repo.list(tenant.id, limit=2, offset=0))
    page2 = list(repo.list(tenant.id, limit=2, offset=2))
    page3 = list(repo.list(tenant.id, limit=2, offset=4))

    assert len(page1) == 2
    assert len(page2) == 2
    assert len(page3) == 1
    # No overlap between pages.
    assert len({d.id for d in page1} | {d.id for d in page2} | {d.id for d in page3}) == 5


def test_repo_count_is_tenant_scoped(db_session, make_tenant):
    t1, u1 = make_tenant()
    t2, u2 = make_tenant()
    repo = DocumentRepository(db_session)

    for _ in range(4):
        repo.create(_make_document(t1.id, u1.id))
    repo.create(_make_document(t2.id, u2.id))
    db_session.commit()

    assert repo.count(t1.id) == 4
    assert repo.count(t2.id) == 1


# ---------------------------------------------------------------------------
# delete
# ---------------------------------------------------------------------------


def test_repo_delete_tenant_scoped(db_session, make_tenant):
    t1, u1 = make_tenant()
    t2, u2 = make_tenant()
    doc = DocumentRepository(db_session).create(_make_document(t1.id, u1.id))
    db_session.commit()

    repo = DocumentRepository(db_session)
    # Cross-tenant delete attempt is a no-op.
    assert repo.delete(doc.id, tenant_id=t2.id) is False
    assert repo.get_by_id(doc.id, tenant_id=t1.id) is not None

    # Correct tenant deletes.
    assert repo.delete(doc.id, tenant_id=t1.id) is True
    db_session.commit()
    assert repo.get_by_id(doc.id, tenant_id=t1.id) is None


def test_repo_delete_missing_returns_false(db_session, make_tenant):
    tenant, _ = make_tenant()
    assert DocumentRepository(db_session).delete(uuid.uuid4(), tenant_id=tenant.id) is False


# ---------------------------------------------------------------------------
# update_storage_uri
# ---------------------------------------------------------------------------


def test_repo_update_storage_uri_tenant_scoped(db_session, make_tenant):
    t1, u1 = make_tenant()
    t2, u2 = make_tenant()
    doc = DocumentRepository(db_session).create(_make_document(t1.id, u1.id))
    db_session.commit()

    repo = DocumentRepository(db_session)
    uri = _storage_uri(t1.id, doc.id)

    updated = repo.update_storage_uri(doc.id, tenant_id=t1.id, storage_uri=uri)
    db_session.commit()

    assert updated is not None
    assert updated.storage_uri == uri

    # Same call with the wrong tenant returns None and does not write.
    again = repo.update_storage_uri(doc.id, tenant_id=t2.id, storage_uri="s3://other-bucket/k")
    assert again is None

    # Original row is unchanged.
    found = repo.get_by_id(doc.id, tenant_id=t1.id)
    assert found is not None
    assert found.storage_uri == uri


def test_repo_update_storage_uri_missing_returns_none(db_session, make_tenant):
    tenant, _ = make_tenant()
    repo = DocumentRepository(db_session)

    assert (
        repo.update_storage_uri(
            uuid.uuid4(),
            tenant_id=tenant.id,
            storage_uri="s3://bucket/k",
        )
        is None
    )


# ---------------------------------------------------------------------------
# update_status
# ---------------------------------------------------------------------------


def test_repo_update_status_tenant_scoped(db_session, make_tenant):
    t1, u1 = make_tenant()
    t2, u2 = make_tenant()
    doc = DocumentRepository(db_session).create(_make_document(t1.id, u1.id))
    db_session.commit()

    repo = DocumentRepository(db_session)
    updated = repo.update_status(doc.id, tenant_id=t1.id, status=DocumentStatus.FAILED)
    db_session.commit()

    assert updated is not None
    assert updated.status is DocumentStatus.FAILED

    # Wrong tenant -> None.
    assert repo.update_status(doc.id, tenant_id=t2.id, status=DocumentStatus.PENDING) is None

    # Original row is still in the state the correct tenant set.
    found = repo.get_by_id(doc.id, tenant_id=t1.id)
    assert found is not None
    assert found.status is DocumentStatus.FAILED


def test_repo_update_status_string_is_accepted(db_session, make_tenant):
    tenant, user = make_tenant()
    doc = DocumentRepository(db_session).create(_make_document(tenant.id, user.id))
    db_session.commit()

    updated = DocumentRepository(db_session).update_status(
        doc.id, tenant_id=tenant.id, status="failed"
    )
    db_session.commit()

    assert updated is not None
    assert updated.status is DocumentStatus.FAILED


def test_repo_update_status_with_expected_version_acts_as_optimistic_lock(db_session, make_tenant):
    tenant, user = make_tenant()
    doc = DocumentRepository(db_session).create(_make_document(tenant.id, user.id))
    db_session.commit()

    repo = DocumentRepository(db_session)
    # Correct version -> write goes through, and we bump the
    # version so the next caller with expected_version=1 is
    # actually stale.
    updated = repo.update_status(
        doc.id,
        tenant_id=tenant.id,
        status=DocumentStatus.FAILED,
        expected_version=1,
        bump_version=True,
    )
    db_session.commit()
    assert updated is not None
    assert updated.status is DocumentStatus.FAILED
    assert updated.version == 2

    # Stale version -> no-op; status is unchanged from the
    # caller's POV and the version is not bumped again.
    again = repo.update_status(
        doc.id,
        tenant_id=tenant.id,
        status=DocumentStatus.PENDING,
        expected_version=1,  # stale: row is now at version 2
    )
    db_session.commit()
    assert again is not None
    assert again.status is DocumentStatus.FAILED
    assert again.version == 2  # not bumped, not overwritten


def test_repo_update_status_with_bump_version(db_session, make_tenant):
    tenant, user = make_tenant()
    doc = DocumentRepository(db_session).create(_make_document(tenant.id, user.id))
    db_session.commit()
    assert doc.version == 1

    updated = DocumentRepository(db_session).update_status(
        doc.id,
        tenant_id=tenant.id,
        status=DocumentStatus.FAILED,
        bump_version=True,
    )
    db_session.commit()

    assert updated is not None
    assert updated.status is DocumentStatus.FAILED
    assert updated.version == 2


def test_repo_update_status_missing_returns_none(db_session, make_tenant):
    tenant, _ = make_tenant()
    assert (
        DocumentRepository(db_session).update_status(
            uuid.uuid4(),
            tenant_id=tenant.id,
            status=DocumentStatus.FAILED,
        )
        is None
    )


# ---------------------------------------------------------------------------
# update (entity-level write path)
# ---------------------------------------------------------------------------


def test_repo_update_persists_entity_changes(db_session, make_tenant):
    tenant, user = make_tenant()
    repo = DocumentRepository(db_session)
    doc = repo.create(_make_document(tenant.id, user.id, title="original"))
    db_session.commit()

    doc.rename("renamed")
    doc.mark_failed()
    updated = repo.update(doc)
    db_session.commit()

    row = db_session.get(DocumentModel, doc.id)
    assert row.title == "renamed"
    assert row.status == "failed"
    assert updated.title == "renamed"
    assert updated.status is DocumentStatus.FAILED


def test_repo_update_rejects_cross_tenant_entity(db_session, make_tenant):
    """
    If a domain entity is constructed with a different
    `tenant_id` than the row in the DB, the repository refuses to
    write. This is the safety net for the
    "this-domain-entity-doesn't-belong-here" mistake.
    """
    t1, u1 = make_tenant()
    t2, u2 = make_tenant()
    repo = DocumentRepository(db_session)
    doc = repo.create(_make_document(t1.id, u1.id))
    db_session.commit()

    # Rebuild the entity against the wrong tenant.
    spoofed = Document(
        id=doc.id,
        tenant_id=t2.id,  # wrong tenant
        source_type=doc.source_type,
        title=doc.title,
        mime_type=doc.mime_type,
        created_by=u2.id,
        version=doc.version,
        status=doc.status,
        created_at=doc.created_at,
    )

    with pytest.raises(Exception):  # noqa: B017
        repo.update(spoofed)
