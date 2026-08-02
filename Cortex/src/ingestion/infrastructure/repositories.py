"""
Repositories for the ingestion bounded context.

A repository is the only place in the system that knows how domain
entities map to ORM rows. Every query that touches tenant data is
explicitly tenant-scoped — there is no "list all documents" call
that omits the tenant filter. That's how the multi-tenant
isolation guarantee is enforced at the data-access layer.

All repositories accept an open `Session` and are not responsible
for transaction boundaries; the application service is.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.ingestion.domain.entities import (
    Document,
    DocumentStatus,
    SourceType,
)
from src.ingestion.infrastructure.models import DocumentModel
from src.shared.exceptions import ValidationException

# ---------------------------------------------------------------------------
# Mapping helpers
# ---------------------------------------------------------------------------


def _as_utc(value: datetime) -> datetime:
    """
    Ensure a datetime is timezone-aware UTC.

    SQLite's `DateTime` columns silently drop the tzinfo on
    round-trip, so a value written as `2026-07-21 10:00:00+00:00`
    comes back as `2026-07-21 10:00:00` (naive). The domain layer
    requires aware datetimes, so we re-attach UTC here. Production
    against PostgreSQL is unaffected because the DB preserves
    tzinfo natively.
    """
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def _document_to_model(document: Document) -> DocumentModel:
    return DocumentModel(
        id=document.id,
        tenant_id=document.tenant_id,
        source_type=document.source_type.value
        if isinstance(document.source_type, SourceType)
        else str(document.source_type),
        title=document.title,
        storage_uri=document.storage_uri,
        mime_type=document.mime_type,
        status=document.status.value
        if isinstance(document.status, DocumentStatus)
        else str(document.status),
        version=document.version,
        created_by=document.created_by,
        created_at=document.created_at,
    )


def _model_to_document(model: DocumentModel) -> Document:
    # Use the persistence-aware factory: the DB is the source of
    # truth for the current state, including statuses we couldn't
    # have arrived at from a fresh `Document.create(...)` call.
    return Document.from_persistence(
        id=model.id,
        tenant_id=model.tenant_id,
        source_type=SourceType(model.source_type),
        title=model.title,
        storage_uri=model.storage_uri,
        mime_type=model.mime_type,
        status=DocumentStatus(model.status),
        version=model.version,
        created_by=model.created_by,
        created_at=_as_utc(model.created_at),
        retry_count=getattr(model, "retry_count", 0) or 0,
        last_error=getattr(model, "last_error", None),
    )


# ---------------------------------------------------------------------------
# DocumentRepository
# ---------------------------------------------------------------------------


class DocumentRepository:
    """
    Persistence-layer operations for the `documents` table.

    Every read is tenant-scoped. There is no method on this class
    that accepts a `document_id` without a `tenant_id` — the only
    way to look up a document is to also say *whose* document it
    is, which is exactly the multi-tenant safety rule.
    """

    def __init__(self, session: Session) -> None:
        self._session = session

    # ---------- writes ----------

    def create(self, document: Document) -> Document:
        """Insert a new document row and return the hydrated entity."""
        model = _document_to_model(document)
        self._session.add(model)
        self._session.flush()
        return _model_to_document(model)

    def update(self, document: Document) -> Document:
        """
        Persist changes to a document that already exists in the DB.

        Tenant safety: refuses to update a document that does not
        belong to the document's `tenant_id`. This guards against
        the case where a domain entity was constructed with a
        different `tenant_id` than the row in the DB.
        """
        model = self._session.get(DocumentModel, document.id)
        if model is None:
            raise ValidationException(
                message=f"Document {document.id} does not exist.",
                code=400,
                data={"field": "id"},
            )
        if model.tenant_id != document.tenant_id:
            raise ValidationException(
                message="Document does not belong to the given tenant.",
                code=400,
                data={"field": "tenant_id"},
            )
        model.title = document.title
        model.storage_uri = document.storage_uri
        model.mime_type = document.mime_type
        model.status = (
            document.status.value
            if isinstance(document.status, DocumentStatus)
            else str(document.status)
        )
        model.version = document.version
        model.source_type = (
            document.source_type.value
            if isinstance(document.source_type, SourceType)
            else str(document.source_type)
        )
        self._session.flush()
        return _model_to_document(model)

    def delete(self, document_id: uuid.UUID, *, tenant_id: uuid.UUID) -> bool:
        """
        Delete a document by id, scoped to a tenant.

        Returns `True` when a row was deleted, `False` when the
        document does not exist *or* belongs to a different tenant.
        The two cases are deliberately indistinguishable at the
        API level — a "does not exist" answer should not leak
        whether a document exists in another tenant.
        """
        model = self._session.get(DocumentModel, document_id)
        if model is None or model.tenant_id != tenant_id:
            return False
        self._session.delete(model)
        self._session.flush()
        return True

    # ---------- reads ----------

    def get_by_id(self, document_id: uuid.UUID, *, tenant_id: uuid.UUID) -> Document | None:
        """
        Fetch a document by id, scoped to a tenant.

        Returns `None` when the document does not exist or belongs
        to a different tenant. There is no overload that omits
        `tenant_id` — the repository cannot be tricked into
        returning a cross-tenant row.
        """
        model = self._session.get(DocumentModel, document_id)
        if model is None or model.tenant_id != tenant_id:
            return None
        return _model_to_document(model)

    def list(
        self,
        tenant_id: uuid.UUID,
        *,
        limit: int = 50,
        offset: int = 0,
    ) -> Sequence[Document]:
        """
        List a tenant's documents, newest first.

        Always paginated: defaults to 50 rows, no upper limit
        enforced here — that's the caller's responsibility. The
        `(tenant_id, created_at)` index makes this query cheap
        regardless of how many documents the tenant has.
        """
        stmt = (
            select(DocumentModel)
            .where(DocumentModel.tenant_id == tenant_id)
            .order_by(DocumentModel.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return [_model_to_document(m) for m in self._session.execute(stmt).scalars().all()]

    def count(self, tenant_id: uuid.UUID) -> int:
        """Return how many documents a tenant has."""
        stmt = select(DocumentModel.id).where(DocumentModel.tenant_id == tenant_id)
        return len(self._session.execute(stmt).scalars().all())

    # ---------- targeted updates ----------

    def update_storage_uri(
        self,
        document_id: uuid.UUID,
        *,
        tenant_id: uuid.UUID,
        storage_uri: str,
    ) -> Document | None:
        """
        Set a document's `storage_uri`, scoped to a tenant.

        Returns the updated document, or `None` if no such
        document exists for the tenant. The V1 upload flow uses
        this immediately after a successful S3 `put_object` to
        point the document at its raw bytes.
        """
        model = self._session.get(DocumentModel, document_id)
        if model is None or model.tenant_id != tenant_id:
            return None
        model.storage_uri = storage_uri
        self._session.flush()
        return _model_to_document(model)

    def update_status(
        self,
        document_id: uuid.UUID,
        *,
        tenant_id: uuid.UUID,
        status: DocumentStatus | str,
        expected_version: int | None = None,
        bump_version: bool = False,
    ) -> Document | None:
        """
        Set a document's `status`, scoped to a tenant.

        The V1 upload flow only writes `pending` (and `failed`).
        The V2 worker pipeline writes the other states. The
        state-machine check still lives in the domain entity —
        this method only enforces tenant isolation and the
        optional optimistic-lock check.

        `expected_version` is an optional optimistic-lock guard:
        if provided, the update is a no-op when the current row
        version does not match. The caller can detect the no-op by
        comparing the returned `version` to `expected_version`.

        `bump_version` is for reprocess: pass `True` to increment
        the version on the same update. The state-machine still
        has to be valid; bumping the version alone does not move
        the document between lifecycle states.
        """
        model = self._session.get(DocumentModel, document_id)
        if model is None or model.tenant_id != tenant_id:
            return None
        if expected_version is not None and model.version != expected_version:
            return _model_to_document(model)
        target_value = status.value if isinstance(status, DocumentStatus) else str(status)
        model.status = target_value
        if bump_version:
            model.version = model.version + 1
        self._session.flush()
        return _model_to_document(model)


__all__ = ["DocumentRepository"]
