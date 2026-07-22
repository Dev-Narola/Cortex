"""
DocumentStatusTransitionService — enforces the ingestion state machine.

The domain entity already owns the transition map. This service is
the application-layer entry point that loads the document, validates
the requested transition against the map, and persists the new status.

Valid V2 transitions (from domain state machine):
    pending  → parsing  | failed
    parsing  → chunking | failed
    chunking → indexed  | failed
    failed   → pending               (retry: restart pipeline)

Blocked without explicit reprocess:
    indexed  → parsing | chunking | pending   (no accidental re-queue)
"""

from __future__ import annotations

import uuid

from src.ingestion.domain.entities import DocumentStatus, is_valid_transition
from src.ingestion.infrastructure.repositories import DocumentRepository
from src.shared.exceptions import NotFoundException, ValidationException


class DocumentStatusTransitionService:
    """
    Validates and applies status transitions.

    All transitions go through `is_valid_transition()` which is
    defined once in the domain and cannot be bypassed by callers.
    """

    def __init__(self, repository: DocumentRepository) -> None:
        self._repository = repository

    def transition(
        self,
        document_id: uuid.UUID,
        *,
        tenant_id: uuid.UUID,
        to_status: DocumentStatus,
        bump_version: bool = False,
    ) -> None:
        """
        Move a document from its current status to `to_status`.

        Raises:
            NotFoundException:  document not found or wrong tenant.
            ValidationException: the transition is not permitted by
                                 the state machine.
        """
        document = self._repository.get_by_id(document_id, tenant_id=tenant_id)
        if document is None:
            raise NotFoundException(
                message="Document not found.",
                code=404,
                data={"document_id": str(document_id)},
            )

        from_status = DocumentStatus(document.status)
        if not is_valid_transition(from_status, to_status):
            raise ValidationException(
                message=(
                    f"Invalid status transition: {from_status.value!r} → "
                    f"{to_status.value!r}."
                ),
                code=422,
                data={
                    "from_status": from_status.value,
                    "to_status": to_status.value,
                },
            )

        self._repository.update_status(
            document_id,
            tenant_id=tenant_id,
            status=to_status,
            bump_version=bump_version,
        )

    def retry(self, document_id: uuid.UUID, *, tenant_id: uuid.UUID) -> None:
        """
        Reset a failed document back to pending so the worker picks it up.

        This is a full pipeline restart (not stage resumption). The existing
        chunks are left in place; the worker's delete-then-insert strategy
        ensures they are replaced atomically on the next run.

        Raises:
            NotFoundException:  document not found.
            ValidationException: document is not currently failed.
        """
        document = self._repository.get_by_id(document_id, tenant_id=tenant_id)
        if document is None:
            raise NotFoundException(
                message="Document not found.",
                code=404,
                data={"document_id": str(document_id)},
            )

        if document.status != DocumentStatus.FAILED:
            raise ValidationException(
                message="Only failed documents can be retried.",
                code=422,
                data={"current_status": str(document.status)},
            )

        self._repository.update_status(
            document_id,
            tenant_id=tenant_id,
            status=DocumentStatus.PENDING,
        )

    def reprocess(self, document_id: uuid.UUID, *, tenant_id: uuid.UUID) -> None:
        """
        Force-reprocess an already-indexed document (e.g. after a model upgrade).

        This is the ONLY permitted path from indexed → parsing.
        It bumps the document version so old and new chunks are distinguishable.

        Raises:
            NotFoundException:  document not found.
            ValidationException: document is not currently indexed.
        """
        document = self._repository.get_by_id(document_id, tenant_id=tenant_id)
        if document is None:
            raise NotFoundException(
                message="Document not found.",
                code=404,
                data={"document_id": str(document_id)},
            )

        if document.status != DocumentStatus.INDEXED:
            raise ValidationException(
                message="Only indexed documents can be explicitly reprocessed.",
                code=422,
                data={"current_status": str(document.status)},
            )

        self._repository.update_status(
            document_id,
            tenant_id=tenant_id,
            status=DocumentStatus.PENDING,
            bump_version=True,
        )
