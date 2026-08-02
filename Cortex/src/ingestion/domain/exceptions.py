"""
Domain exceptions for the ingestion bounded context.

These exceptions describe business-rule violations that are specific
to documents and the ingestion pipeline. They are intentionally
independent of FastAPI, SQLAlchemy, boto3, or any other infrastructure
concern, so the domain layer can be unit-tested without bringing the
web framework along.

The hierarchy:

* `IngestionDomainException`
    * `DocumentNotFoundException`      — 404, no such document for tenant
    * `DocumentStateException`         — 409, illegal status transition
    * `InvalidDocumentFieldException`  — 400, a document field is invalid

Common validation errors (empty title, bad MIME type, bad UUID) are
still surfaced through the generic `ValidationException` in
`src/shared/exceptions.py` so callers can catch them with the same
exception type they already use for input validation across the
codebase.
"""

from __future__ import annotations

from src.shared.exceptions import (
    BaseAppException,
    NotFoundException,
    ValidationException,
)


class IngestionDomainException(BaseAppException):
    """
    Base exception for every domain-level error in the ingestion
    bounded context. Catching this is the right thing to do when you
    want to handle any ingestion-specific failure without caring
    about its HTTP semantics.
    """


class DocumentNotFoundException(NotFoundException, IngestionDomainException):
    """
    Raised when a document cannot be located for a given tenant.

    Inherits from both `NotFoundException` (so the global exception
    handler maps it to HTTP 404) and `IngestionDomainException`
    (so domain callers can catch a single base class for ingestion
    errors).
    """

    def __init__(
        self,
        message: str = "Document not found.",
        *,
        document_id: str | None = None,
        tenant_id: str | None = None,
    ) -> None:
        data: dict | None = None
        if document_id is not None or tenant_id is not None:
            data = {}
            if document_id is not None:
                data["document_id"] = document_id
            if tenant_id is not None:
                data["tenant_id"] = tenant_id
        super().__init__(message=message, code=404, data=data)


class DocumentStateException(IngestionDomainException):
    """
    Raised when a document is asked to make an illegal status
    transition — for example, an upload-flow code path attempting
    to mark a freshly-uploaded document as `indexed` without first
    going through parsing/chunking/embedding.
    """

    def __init__(
        self,
        message: str,
        *,
        from_status: str | None = None,
        to_status: str | None = None,
    ) -> None:
        data: dict | None = None
        if from_status is not None or to_status is not None:
            data = {}
            if from_status is not None:
                data["from"] = from_status
            if to_status is not None:
                data["to"] = to_status
        super().__init__(message=message, code=409, data=data)


class InvalidDocumentFieldException(ValidationException, IngestionDomainException):
    """
    Raised when a document field is rejected at the domain level
    — used for cases that aren't covered by the generic
    `ValidationException` (e.g. an unsupported MIME type that has
    a specific business meaning in the ingestion pipeline).
    """

    def __init__(
        self,
        message: str,
        *,
        field: str | None = None,
        value: object = None,
    ) -> None:
        data: dict | None = None
        if field is not None:
            data = {"field": field}
            if value is not None:
                data["value"] = value
        super().__init__(message=message, code=400, data=data)


__all__ = [
    "DocumentNotFoundException",
    "DocumentStateException",
    "IngestionDomainException",
    "InvalidDocumentFieldException",
]
