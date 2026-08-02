"""
Object storage abstraction for the ingestion bounded context.

Documents are stored in object storage (S3 in production) and the
`documents.storage_uri` column holds the pointer. The application
layer must depend on this abstraction, not directly on boto3 or
any other concrete client — that's how the rest of the codebase
stays testable without a real S3 connection and how a future swap
(e.g. to GCS, MinIO, or a local disk store) can happen without
touching the upload service.

The dependency direction is:

    Application Service
            │
            ▼
    ObjectStorage (this module)
            │
            ▼
    S3Storage | LocalStorage | ...

This module ships the `ObjectStorage` interface plus an in-memory
`LocalStorage` reference implementation that the upload service
can use in tests and local development. The S3 implementation
itself lives outside V1 scope and is added in a follow-up task;
its signature is already pinned by this interface.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections import defaultdict
from typing import BinaryIO

from src.shared.exceptions import NotFoundException

# ---------------------------------------------------------------------------
# Storage exception
# ---------------------------------------------------------------------------


class ObjectNotFoundError(NotFoundException):
    """
    Raised by an `ObjectStorage` implementation when the requested
    object does not exist.

    Inherits from `NotFoundException` (so the global exception
    handler maps it to HTTP 404) and lives in this module so
    storage code can raise it without reaching across module
    boundaries.
    """

    def __init__(
        self,
        message: str = "Object not found in storage.",
        *,
        uri: str | None = None,
    ) -> None:
        data: dict | None = {"uri": uri} if uri is not None else None
        super().__init__(message=message, code=404, data=data)


# ---------------------------------------------------------------------------
# ObjectStorage interface
# ---------------------------------------------------------------------------


class ObjectStorage(ABC):
    """
    Abstract interface for storing and retrieving raw document
    bytes.

    All methods are synchronous; the upload service is the one
    that decides whether the call should run in a thread. The
    interface intentionally does not expose connection or bucket
    configuration — implementations are constructed with whatever
    credentials and bucket name they need, so callers don't have
    to repeat them on every call.

    Implementations must be safe to share across threads. The
    upload service holds one instance per app and dispatches all
    storage calls through it.
    """

    @abstractmethod
    def upload(
        self,
        *,
        uri: str,
        data: bytes | BinaryIO,
        content_type: str | None = None,
    ) -> str:
        """
        Store an object at `uri` and return the canonical URI it
        ended up at.

        `data` may be either an in-memory `bytes` buffer or a
        readable binary file-like object. Implementations should
        stream the data when a file-like is given rather than
        forcing it into memory — the V1 upload service will hand
        in a `SpooledTemporaryFile` for large documents.

        `content_type` is a hint for the storage backend; passing
        `None` means "let the backend decide" (which usually means
        `application/octet-stream` for S3).

        Implementations must overwrite any existing object at the
        same URI without raising. The upload service is
        idempotent at the document level, so a retry hitting the
        same URI must not fail.
        """
        raise NotImplementedError

    @abstractmethod
    def delete(self, uri: str) -> bool:
        """
        Delete the object at `uri`.

        Returns `True` when an object was actually deleted, `False`
        when the URI did not exist. The upload service treats both
        outcomes as success on the document-deletion path (a
        missing object is not an error in that context).
        """
        raise NotImplementedError

    @abstractmethod
    def exists(self, uri: str) -> bool:
        """
        Return `True` iff an object exists at `uri`. Used by the
        application service to detect a partial-failure window
        where the row exists but the S3 object does not (or vice
        versa) so it can clean up the orphaned side.
        """
        raise NotImplementedError

    @abstractmethod
    def download(self, uri: str) -> bytes:
        """
        Read the object's bytes.

        V1's HTTP surface does not expose document downloads, but
        the V2 parser pipeline needs to read the raw bytes back
        from S3 to extract text. Implementations are required to
        support this so the abstraction doesn't have to be
        revisited when the parser ships.

        Raises `ObjectNotFoundError` when the URI does not exist.
        """
        raise NotImplementedError


# ---------------------------------------------------------------------------
# LocalStorage — in-memory reference implementation
# ---------------------------------------------------------------------------


class LocalStorage(ObjectStorage):
    """
    In-memory implementation of `ObjectStorage`.

    Used by the upload service in tests and local development when
    no real S3 bucket is configured. Objects live in a process-wide
    dict; restarting the process loses them, which is the right
    behavior for tests but the wrong behavior for production
    (which is why the S3 implementation exists).

    The implementation is deliberately tiny — it exists to pin
    the contract the S3 implementation will have to satisfy and
    to give tests a fast, hermetic storage backend.
    """

    def __init__(self) -> None:
        # `dict[uri, bytes]` for the objects themselves, plus a
        # parallel `dict[uri, content_type]` so the upload
        # service can ask "what content type did we store this
        # as" without an extra round-trip.
        self._objects: dict[str, bytes] = {}
        self._content_types: dict[str, str | None] = {}
        # Counter for `upload` returning the canonical URI; lets
        # the interface contract be tested even when the
        # implementation rewrites the URI.
        self._upload_count: dict[str, int] = defaultdict(int)

    # ---------- ObjectStorage ----------

    def upload(
        self,
        *,
        uri: str,
        data: bytes | BinaryIO,
        content_type: str | None = None,
    ) -> str:
        if not isinstance(uri, str) or not uri:
            raise ValueError("uri must be a non-empty string")
        payload = self._read_payload(data)
        self._objects[uri] = payload
        self._content_types[uri] = content_type
        self._upload_count[uri] += 1
        return uri

    def delete(self, uri: str) -> bool:
        existed = uri in self._objects
        self._objects.pop(uri, None)
        self._content_types.pop(uri, None)
        self._upload_count.pop(uri, None)
        return existed

    def exists(self, uri: str) -> bool:
        return uri in self._objects

    def download(self, uri: str) -> bytes:
        try:
            return self._objects[uri]
        except KeyError as exc:
            raise ObjectNotFoundError(
                message=f"No object stored at {uri!r}.",
                uri=uri,
            ) from exc

    # ---------- testing helpers ----------

    def get_content_type(self, uri: str) -> str | None:
        """Return the content type that was passed for the latest upload."""
        return self._content_types.get(uri)

    def get_upload_count(self, uri: str) -> int:
        """Return how many times `uri` has been uploaded. Tests use this."""
        return self._upload_count.get(uri, 0)

    def size(self, uri: str) -> int:
        """Return the size in bytes of the object at `uri`."""
        return len(self._objects.get(uri, b""))

    def clear(self) -> None:
        """Wipe all stored objects. Intended for test isolation."""
        self._objects.clear()
        self._content_types.clear()
        self._upload_count.clear()

    # ---------- internal helpers ----------

    @staticmethod
    def _read_payload(data: bytes | BinaryIO) -> bytes:
        """Normalize `bytes` and binary file-like inputs to `bytes`."""
        if isinstance(data, bytes):
            return data
        if hasattr(data, "read"):
            # Read everything into memory. The V1 upload path
            # already has the file in memory (`SpooledTemporaryFile`
            # for the small-file fast path) so this isn't a
            # memory-pressure risk in tests.
            buf = data.read()
            if isinstance(buf, str):  # pragma: no cover - safety
                buf = buf.encode("utf-8")
            return bytes(buf)
        raise TypeError(
            f"data must be bytes or a binary file-like object, got {type(data).__name__}"
        )


__all__ = ["LocalStorage", "ObjectNotFoundError", "ObjectStorage"]
