"""
Domain entities for the ingestion bounded context.

This module contains the pure-Python domain model for the
`Document` aggregate. Per the project's hexagonal layout, no entity
in this file should import from FastAPI, SQLAlchemy, boto3, or any
other infrastructure concern — the rules enforced here must hold in
unit tests exactly as they hold in production.

The V1 scope is intentionally narrow: a `Document` represents a
tenant-scoped record of an uploaded file and a pointer to where its
raw bytes live in object storage. The lifecycle transitions
`parsing → chunking → embedding → indexed` are encoded in the
entity, but V1 only moves documents through `pending` (and
optionally `failed` on storage failure). The other transitions exist
so V2/V3 can plug in the worker pipeline without having to come back
and edit the domain.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import ClassVar

from src.ingestion.domain.exceptions import (
    DocumentStateException,
    InvalidDocumentFieldException,
)
from src.shared.exceptions import ValidationException

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class SourceType(str, Enum):  # noqa: UP042 - intentional str-Enum for JSON
    """
    How a document entered the system.

    V1 supports only `UPLOAD`. `URL` and `API` are reserved for later
    versions but live in the domain now so the persistence schema
    and the API surface don't have to be revisited when those
    ingestion paths ship.
    """

    UPLOAD = "upload"
    URL = "url"
    API = "api"


class DocumentStatus(str, Enum):  # noqa: UP042 - intentional str-Enum for JSON
    """
    Lifecycle status of a document.

    The full pipeline is:

        pending → parsing → chunking → embedding → indexed

    with `failed` as a terminal-ish failure state that can be retried.

    V1 only moves documents through `pending` (and `failed` if the
    initial storage step fails). The other transitions are encoded
    here so the state machine is testable today, even though the
    workers that drive those transitions are not yet wired up.
    """

    PENDING = "pending"
    PARSING = "parsing"
    CHUNKING = "chunking"
    EMBEDDING = "embedding"
    INDEXED = "indexed"
    FAILED = "failed"


# ---------------------------------------------------------------------------
# State machine
# ---------------------------------------------------------------------------


# Allowed transitions: `from -> {to, ...}`. Anything not in this map
# is illegal and raises `DocumentStateException`. The special-case
# `failed -> pending` is supported so the user-facing "Retry" button
# has a path to put the document back in the queue without a version
# bump (a retry is idempotent; a re-process increments `version`).
_ALLOWED_TRANSITIONS: dict[DocumentStatus, frozenset[DocumentStatus]] = {
    DocumentStatus.PENDING: frozenset(
        {DocumentStatus.PARSING, DocumentStatus.FAILED}
    ),
    DocumentStatus.PARSING: frozenset(
        {DocumentStatus.CHUNKING, DocumentStatus.FAILED}
    ),
    DocumentStatus.CHUNKING: frozenset(
        {DocumentStatus.EMBEDDING, DocumentStatus.FAILED}
    ),
    DocumentStatus.EMBEDDING: frozenset(
        {DocumentStatus.INDEXED, DocumentStatus.FAILED}
    ),
    DocumentStatus.INDEXED: frozenset(
        {DocumentStatus.PARSING, DocumentStatus.FAILED}
    ),
    DocumentStatus.FAILED: frozenset(
        {DocumentStatus.PENDING, DocumentStatus.PARSING}
    ),
}


def is_valid_transition(
    from_status: DocumentStatus, to_status: DocumentStatus
) -> bool:
    """Return True iff `from -> to` is a permitted status transition."""
    return to_status in _ALLOWED_TRANSITIONS.get(from_status, frozenset())


# ---------------------------------------------------------------------------
# MIME type allowlist
# ---------------------------------------------------------------------------


# Conservative V1 set: the four formats the UI promises to accept in
# the upload modal. The parser module (V2) will gate on this same
# set, so adding a new format here is a deliberate cross-layer
# decision, not something a single team can quietly enable.
_ALLOWED_MIME_TYPES: frozenset[str] = frozenset(
    {
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # .docx
        "text/plain",
        "text/markdown",
    }
)

# Storage URIs in V1 are S3 URIs of the form
#   s3://<bucket>/<tenant-id>/<document-id>
# The bucket is configured by the platform, not by callers, so the
# domain only validates the URI's *shape*, not that the bucket
# actually exists. That check is the storage layer's job.
#
# Bucket rule (mirroring the AWS S3 bucket-naming rules, which
# the V1 platform depends on anyway): lowercase, 3-63 chars,
# starting with a letter or digit, no underscores.
#
# Key rule: anything that doesn't include a control character.
# We restrict to the URL-safe subset so the URI can be safely
# embedded in HTTP headers, log lines, etc.
_S3_URI_PATTERN = (
    r"^s3://[a-z0-9][a-z0-9.\-]{1,62}"  # bucket: 2-63 lowercase chars
    r"/[A-Za-z0-9][A-Za-z0-9._/\-]{0,1020}$"  # key: 1+ URL-safe chars
)
import re  # noqa: E402  - placed after the constants that use it for clarity

_S3_URI_RE = re.compile(_S3_URI_PATTERN)


# ---------------------------------------------------------------------------
# Document
# ---------------------------------------------------------------------------


@dataclass(eq=False)
class Document:
    """
    Document — a tenant-scoped record of an ingested file.

    The database never stores the file bytes; the raw file lives in
    S3 and `storage_uri` is the pointer. The Document entity here
    only knows about the metadata and the lifecycle.

    Business rules enforced by this entity:

    * `title` is non-empty (whitespace-only is rejected).
    * `mime_type` is present and in the V1 allowlist.
    * `tenant_id` is a UUID.
    * `created_by` is a UUID.
    * `version` is `>= 1`.
    * `status` is a valid `DocumentStatus`.
    * `source_type` is a valid `SourceType`.
    * `storage_uri`, if present, looks like an S3 URI.
    * Status transitions go through the documented state machine
      (see `_ALLOWED_TRANSITIONS`).
    * An uploaded document cannot be marked `indexed` directly by
      the V1 upload flow — `mark_indexed()` only works after the
      document has been through `embedding`.
    * `created_at` is timezone-aware.
    """

    tenant_id: uuid.UUID
    source_type: SourceType | str
    title: str
    mime_type: str
    created_by: uuid.UUID
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    storage_uri: str | None = None
    status: DocumentStatus | str = DocumentStatus.PENDING
    version: int = 1
    created_at: datetime = field(
        default_factory=lambda: datetime.now(UTC)
    )

    # ----- length / numeric bounds -----

    _TITLE_MAX_LENGTH: ClassVar[int] = 512
    _MIME_TYPE_MAX_LENGTH: ClassVar[int] = 255
    _STORAGE_URI_MAX_LENGTH: ClassVar[int] = 1024

    # ---------- factory helpers ----------

    @classmethod
    def create(
        cls,
        *,
        tenant_id: uuid.UUID,
        source_type: SourceType | str,
        title: str,
        mime_type: str,
        created_by: uuid.UUID,
        storage_uri: str | None = None,
        status: DocumentStatus | str = DocumentStatus.PENDING,
        version: int = 1,
    ) -> Document:
        """
        Construct a new document.

        Prefer this over calling the dataclass initializer directly —
        it makes the intent ("I am creating a new document") explicit
        at call sites and centralizes the construction-time defaults.
        `storage_uri` is optional at creation time because the upload
        service may set it just after persisting the row, once the
        S3 `put_object` has succeeded.
        """
        return cls(
            tenant_id=tenant_id,
            source_type=source_type,  # type: ignore[arg-type]
            title=title,
            storage_uri=storage_uri,
            mime_type=mime_type,
            status=status,  # type: ignore[arg-type]
            version=version,
            created_by=created_by,
        )

    @classmethod
    def from_persistence(
        cls,
        *,
        id: uuid.UUID,
        tenant_id: uuid.UUID,
        source_type: SourceType | str,
        title: str,
        storage_uri: str | None,
        mime_type: str,
        status: DocumentStatus | str,
        version: int,
        created_by: uuid.UUID,
        created_at: datetime,
    ) -> Document:
        """
        Reconstruct a Document from a persistence-layer row.

        Like `Tenant.from_persistence`, this bypasses the
        transition-rule checks (the DB is the source of truth for
        what state the row is in) but still runs all the per-field
        validation. Callers are expected to map from a SQLAlchemy
        row; the constructor itself does no I/O.
        """
        # Bypass `__init__`/`__post_init__` so we don't reject a row
        # whose current `status` happens to be one we couldn't have
        # arrived at from a fresh create call (e.g. an `indexed`
        # row loaded back from the database). All per-field checks
        # still run.
        instance = object.__new__(cls)
        object.__setattr__(instance, "id", id)
        object.__setattr__(instance, "tenant_id", tenant_id)
        object.__setattr__(
            instance, "source_type", cls._validate_source_type(source_type)
        )
        object.__setattr__(instance, "title", cls._validate_title(title))
        object.__setattr__(
            instance,
            "storage_uri",
            cls._validate_storage_uri(storage_uri, allow_empty=True),
        )
        object.__setattr__(
            instance, "mime_type", cls._validate_mime_type(mime_type)
        )
        object.__setattr__(
            instance, "status", cls._validate_status(status)
        )
        object.__setattr__(instance, "version", cls._validate_version(version))
        object.__setattr__(
            instance, "created_by", cls._validate_user_id(created_by, field="created_by")
        )
        object.__setattr__(instance, "created_at", cls._validate_timestamp(created_at))
        return instance

    # ---------- validation ----------

    def __post_init__(self) -> None:
        """Enforce the business rules documented on the class."""
        object.__setattr__(
            self, "tenant_id", self._validate_tenant_id(self.tenant_id)
        )
        object.__setattr__(
            self, "source_type", self._validate_source_type(self.source_type)
        )
        object.__setattr__(self, "title", self._validate_title(self.title))
        object.__setattr__(
            self,
            "storage_uri",
            self._validate_storage_uri(self.storage_uri, allow_empty=True),
        )
        object.__setattr__(self, "mime_type", self._validate_mime_type(self.mime_type))
        object.__setattr__(self, "status", self._validate_status(self.status))
        object.__setattr__(self, "version", self._validate_version(self.version))
        object.__setattr__(
            self, "created_by", self._validate_user_id(self.created_by, field="created_by")
        )
        object.__setattr__(
            self, "created_at", self._validate_timestamp(self.created_at)
        )

    @staticmethod
    def _validate_tenant_id(tenant_id: uuid.UUID) -> uuid.UUID:
        if not isinstance(tenant_id, uuid.UUID):
            raise ValidationException(
                message="Document tenant_id must be a UUID.",
                code=400,
                data={"field": "tenant_id"},
            )
        return tenant_id

    @staticmethod
    def _validate_user_id(user_id: uuid.UUID, *, field: str) -> uuid.UUID:
        if not isinstance(user_id, uuid.UUID):
            raise ValidationException(
                message=f"Document {field} must be a UUID.",
                code=400,
                data={"field": field},
            )
        return user_id

    @staticmethod
    def _validate_title(title: str) -> str:
        if not isinstance(title, str):
            raise ValidationException(
                message="Document title must be a string.",
                code=400,
                data={"field": "title"},
            )
        cleaned = title.strip()
        if not cleaned:
            raise ValidationException(
                message="Document title cannot be empty.",
                code=400,
                data={"field": "title"},
            )
        if len(cleaned) > Document._TITLE_MAX_LENGTH:
            raise ValidationException(
                message=(
                    f"Document title cannot exceed {Document._TITLE_MAX_LENGTH} "
                    "characters."
                ),
                code=400,
                data={
                    "field": "title",
                    "max_length": Document._TITLE_MAX_LENGTH,
                },
            )
        return cleaned

    @staticmethod
    def _validate_mime_type(mime_type: str) -> str:
        if not isinstance(mime_type, str) or not mime_type.strip():
            # Empty / whitespace mime_type is treated as
            # "unsupported" rather than a generic validation
            # error so the upload service can map every
            # mime-related failure to the same exception
            # type and the UI can show a single error.
            raise InvalidDocumentFieldException(
                message="Document mime_type is required.",
                field="mime_type",
                value=mime_type,
            )
        cleaned = mime_type.strip().lower()
        if len(cleaned) > Document._MIME_TYPE_MAX_LENGTH:
            raise InvalidDocumentFieldException(
                message=(
                    f"Document mime_type cannot exceed "
                    f"{Document._MIME_TYPE_MAX_LENGTH} characters."
                ),
                field="mime_type",
                value=cleaned,
            )
        if cleaned not in _ALLOWED_MIME_TYPES:
            raise InvalidDocumentFieldException(
                message=(
                    f"Unsupported mime_type '{cleaned}'. V1 supports: "
                    f"{', '.join(sorted(_ALLOWED_MIME_TYPES))}."
                ),
                field="mime_type",
                value=cleaned,
            )
        return cleaned

    @staticmethod
    def _validate_storage_uri(
        storage_uri: str | None, *, allow_empty: bool
    ) -> str | None:
        if storage_uri is None:
            return None
        if not isinstance(storage_uri, str):
            raise ValidationException(
                message="Document storage_uri must be a string when present.",
                code=400,
                data={"field": "storage_uri"},
            )
        cleaned = storage_uri.strip()
        if not cleaned:
            if allow_empty:
                return None
            raise ValidationException(
                message="Document storage_uri cannot be empty.",
                code=400,
                data={"field": "storage_uri"},
            )
        if len(cleaned) > Document._STORAGE_URI_MAX_LENGTH:
            raise InvalidDocumentFieldException(
                message=(
                    f"Document storage_uri cannot exceed "
                    f"{Document._STORAGE_URI_MAX_LENGTH} characters."
                ),
                field="storage_uri",
                value=cleaned,
            )
        if not _S3_URI_RE.match(cleaned):
            raise InvalidDocumentFieldException(
                message=(
                    "Document storage_uri must be a valid s3:// URI "
                    "(s3://<bucket>/<key>)."
                ),
                field="storage_uri",
                value=cleaned,
            )
        return cleaned

    @staticmethod
    def _validate_source_type(source_type: SourceType | str) -> SourceType:
        if isinstance(source_type, SourceType):
            return source_type
        if isinstance(source_type, str):
            try:
                return SourceType(source_type)
            except ValueError as exc:
                raise ValidationException(
                    message=(
                        f"Invalid source_type '{source_type}'. Must be one of: "
                        f"{', '.join(s.value for s in SourceType)}."
                    ),
                    code=400,
                    data={"field": "source_type", "value": source_type},
                ) from exc
        raise ValidationException(
            message=(
                "source_type must be a SourceType enum value or a valid "
                "source_type string."
            ),
            code=400,
            data={"field": "source_type"},
        )

    @staticmethod
    def _validate_status(status: DocumentStatus | str) -> DocumentStatus:
        if isinstance(status, DocumentStatus):
            return status
        if isinstance(status, str):
            try:
                return DocumentStatus(status)
            except ValueError as exc:
                raise ValidationException(
                    message=(
                        f"Invalid status '{status}'. Must be one of: "
                        f"{', '.join(s.value for s in DocumentStatus)}."
                    ),
                    code=400,
                    data={"field": "status", "value": status},
                ) from exc
        raise ValidationException(
            message=(
                "status must be a DocumentStatus enum value or a valid "
                "status string."
            ),
            code=400,
            data={"field": "status"},
        )

    @staticmethod
    def _validate_version(version: int) -> int:
        if not isinstance(version, int) or isinstance(version, bool):
            raise ValidationException(
                message="Document version must be an integer.",
                code=400,
                data={"field": "version"},
            )
        if version < 1:
            raise ValidationException(
                message="Document version must be >= 1.",
                code=400,
                data={"field": "version", "min": 1},
            )
        return version

    @staticmethod
    def _validate_timestamp(value: datetime) -> datetime:
        if not isinstance(value, datetime):
            raise ValidationException(
                message="Document created_at must be a datetime.",
                code=400,
                data={"field": "created_at"},
            )
        if value.tzinfo is None:
            raise ValidationException(
                message="Document created_at must be timezone-aware.",
                code=400,
                data={"field": "created_at"},
            )
        return value

    # ---------- transition helpers ----------

    def _transition(self, to_status: DocumentStatus) -> None:
        """
        Apply a status transition, enforcing the state machine.

        The transition rule is *strict per call*: even a
        self-transition (e.g. `failed -> failed`) is rejected
        unless the state machine explicitly allows it. That keeps
        `mark_failed` honest — you cannot "fail" a document that
        is already failed; the only ways to leave the `failed`
        state are `requeue` (-> `pending`) or the V2 retry path
        (-> `parsing`).
        """
        current = self._validate_status(self.status)
        target = self._validate_status(to_status)
        if not is_valid_transition(current, target):
            raise DocumentStateException(
                message=(
                    f"Illegal document status transition: "
                    f"{current.value} -> {target.value}."
                ),
                from_status=current.value,
                to_status=target.value,
            )
        object.__setattr__(self, "status", target)

    # ---------- mutators ----------

    def set_storage_uri(self, storage_uri: str) -> None:
        """
        Set the storage URI. Used by the application service after
        a successful S3 `put_object` to point the document at its
        raw bytes. Does not touch `version` — pointing at a new
        location is a normal post-upload fixup, not a re-process.
        """
        object.__setattr__(
            self,
            "storage_uri",
            self._validate_storage_uri(storage_uri, allow_empty=False),
        )

    def rename(self, new_title: str) -> None:
        """Change the document's display title. Validates the new value."""
        object.__setattr__(self, "title", self._validate_title(new_title))

    def mark_parsing(self) -> None:
        """Move `pending` → `parsing`. Worker-side transition."""
        self._transition(DocumentStatus.PARSING)

    def mark_chunking(self) -> None:
        """Move `parsing` → `chunking`. Worker-side transition."""
        self._transition(DocumentStatus.CHUNKING)

    def mark_embedding(self) -> None:
        """Move `chunking` → `embedding`. Worker-side transition."""
        self._transition(DocumentStatus.EMBEDDING)

    def mark_indexed(self) -> None:
        """
        Move `embedding` → `indexed`. Worker-side transition.

        This is the rule the V1 upload flow relies on: a freshly
        uploaded document is `pending` and cannot reach `indexed`
        without going through parsing → chunking → embedding first.
        Calling this from the upload path (which has the document
        in `pending`) raises `DocumentStateException`.
        """
        self._transition(DocumentStatus.INDEXED)

    def mark_failed(self) -> None:
        """
        Move the document to `failed` from any non-terminal state.

        `failed` itself is not a "from" state for `mark_failed` —
        we don't need a transition rule to fail the same document
        twice; the entity just refuses the call to keep the
        invariant (a failed document stays failed until requeued).
        """
        self._transition(DocumentStatus.FAILED)

    def requeue(self) -> None:
        """
        Move `failed` → `pending` to retry ingestion.

        The V1 upload flow does not call this directly. The UI's
        "Retry" button drives it, and the resulting `pending`
        document gets picked up by the V2 worker.

        Idempotent: requeuing a document already in `pending` is
        a no-op. (Unlike the other transitions, this one is
        explicitly lenient because the UI's "Retry" button
        sometimes gets clicked twice.)
        """
        if self.status is DocumentStatus.PENDING:
            return
        self._transition(DocumentStatus.PENDING)

    def bump_version(self) -> None:
        """
        Increment the version, used on re-process.

        The version field is the contract that lets the
        chunking/embedding layers cleanly supersede the previous
        version's `document_chunks` rows on reprocess without a
        distributed transaction.
        """
        object.__setattr__(self, "version", self.version + 1)

    # ---------- identity ----------

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Document):
            return NotImplemented
        return self.id == other.id

    def __hash__(self) -> int:
        return hash(self.id)

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return (
            f"Document(id={self.id!r}, tenant_id={self.tenant_id!r}, "
            f"title={self.title!r}, status={self.status!r}, "
            f"version={self.version!r})"
        )


__all__ = [
    "Document",
    "DocumentStatus",
    "SourceType",
    "is_valid_transition",
]
