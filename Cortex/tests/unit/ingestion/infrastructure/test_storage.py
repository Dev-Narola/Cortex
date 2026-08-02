"""
Unit tests for the object storage abstraction.

The `ObjectStorage` interface is the boundary between the
application layer and any concrete storage backend (S3, local
disk, in-memory, …). The tests in this file cover two things:

1. The contract: every concrete implementation of
   `ObjectStorage` must satisfy the same set of invariants
   (idempotent upload, missing-object semantics, etc.). A
   fake implementation is used here to exercise the interface
   itself.
2. The reference implementation: `LocalStorage` is what the
   upload service uses in tests and local dev, so its own
   behavior gets covered directly.
"""

from __future__ import annotations

import io

import pytest

from src.ingestion.infrastructure.storage import (
    LocalStorage,
    ObjectNotFoundError,
    ObjectStorage,
)

# ---------------------------------------------------------------------------
# Interface contract — verified against a tiny in-memory fake so
# the assertions are about the abstraction, not about
# LocalStorage specifically.
# ---------------------------------------------------------------------------


class _FakeStorage(ObjectStorage):
    """Minimal in-memory ObjectStorage used to exercise the interface."""

    def __init__(self) -> None:
        self.store: dict[str, bytes] = {}
        self.content_types: dict[str, str | None] = {}
        self.upload_calls: list[tuple[str, int]] = []

    def upload(self, *, uri, data, content_type=None):
        payload = self._read(data)
        self.store[uri] = payload
        self.content_types[uri] = content_type
        self.upload_calls.append((uri, len(payload)))
        return uri

    def delete(self, uri):
        existed = uri in self.store
        self.store.pop(uri, None)
        self.content_types.pop(uri, None)
        return existed

    def exists(self, uri):
        return uri in self.store

    def download(self, uri):
        if uri not in self.store:
            raise ObjectNotFoundError(uri=uri)
        return self.store[uri]

    @staticmethod
    def _read(data):
        if isinstance(data, bytes):
            return data
        return data.read()


def test_cannot_instantiate_abstract_object_storage_directly():
    with pytest.raises(TypeError):
        ObjectStorage()  # type: ignore[abstract]


def test_subclass_must_implement_all_abstract_methods():
    class Incomplete(ObjectStorage):
        def upload(self, *, uri, data, content_type=None):  # pragma: no cover
            return uri

    with pytest.raises(TypeError):
        Incomplete()  # type: ignore[abstract]


def test_upload_returns_canonical_uri(_fake_storage):
    fake = _fake_storage

    result = fake.upload(
        uri="s3://bucket/key",
        data=b"hello",
        content_type="text/plain",
    )

    assert result == "s3://bucket/key"


def test_upload_overwrites_existing_object(_fake_storage):
    """Implementations must overwrite, not fail, on a duplicate URI."""
    fake = _fake_storage

    fake.upload(uri="s3://b/k", data=b"first")
    fake.upload(uri="s3://b/k", data=b"second")

    assert fake.download("s3://b/k") == b"second"


def test_exists_reports_presence(_fake_storage):
    fake = _fake_storage

    assert fake.exists("s3://b/missing") is False
    fake.upload(uri="s3://b/k", data=b"x")
    assert fake.exists("s3://b/k") is True


def test_delete_returns_true_when_object_existed(_fake_storage):
    fake = _fake_storage
    fake.upload(uri="s3://b/k", data=b"x")

    assert fake.delete("s3://b/k") is True
    assert fake.exists("s3://b/k") is False


def test_delete_returns_false_when_object_missing(_fake_storage):
    assert _fake_storage.delete("s3://b/missing") is False


def test_download_missing_raises_object_not_found(_fake_storage):
    with pytest.raises(ObjectNotFoundError) as exc_info:
        _fake_storage.download("s3://b/missing")

    assert exc_info.value.code == 404
    assert exc_info.value.data == {"uri": "s3://b/missing"}


def test_object_not_found_is_a_not_found_exception():
    """The exception is a `NotFoundException` so the global handler maps to 404."""
    from src.shared.exceptions import NotFoundException

    assert issubclass(ObjectNotFoundError, NotFoundException)


def test_upload_accepts_binary_file_like(_fake_storage):
    fake = _fake_storage
    buffer = io.BytesIO(b"streamed-payload")

    fake.upload(uri="s3://b/k", data=buffer, content_type="application/pdf")

    assert fake.download("s3://b/k") == b"streamed-payload"
    assert fake.content_types["s3://b/k"] == "application/pdf"


# ---------------------------------------------------------------------------
# LocalStorage — the in-memory reference implementation
# ---------------------------------------------------------------------------


@pytest.fixture
def _fake_storage():
    return _FakeStorage()


# Note: separate from the LocalStorage tests below so a test that
# needs the fake can ask for it explicitly.


class TestLocalStorage:
    """Direct tests for the `LocalStorage` reference implementation."""

    def test_upload_and_download_round_trip(self):
        storage = LocalStorage()
        storage.upload(
            uri="s3://b/k",
            data=b"raw-bytes",
            content_type="application/pdf",
        )

        assert storage.download("s3://b/k") == b"raw-bytes"
        assert storage.get_content_type("s3://b/k") == "application/pdf"

    def test_upload_is_idempotent(self):
        storage = LocalStorage()
        storage.upload(uri="s3://b/k", data=b"v1")
        storage.upload(uri="s3://b/k", data=b"v2")

        assert storage.download("s3://b/k") == b"v2"
        assert storage.get_upload_count("s3://b/k") == 2

    def test_exists(self):
        storage = LocalStorage()
        assert storage.exists("s3://b/k") is False
        storage.upload(uri="s3://b/k", data=b"x")
        assert storage.exists("s3://b/k") is True

    def test_delete_returns_true_when_present(self):
        storage = LocalStorage()
        storage.upload(uri="s3://b/k", data=b"x")

        assert storage.delete("s3://b/k") is True
        assert storage.exists("s3://b/k") is False

    def test_delete_returns_false_when_missing(self):
        assert LocalStorage().delete("s3://b/missing") is False

    def test_download_missing_raises(self):
        storage = LocalStorage()
        with pytest.raises(ObjectNotFoundError) as exc_info:
            storage.download("s3://b/missing")
        assert exc_info.value.data == {"uri": "s3://b/missing"}

    def test_upload_rejects_empty_uri(self):
        storage = LocalStorage()
        with pytest.raises(ValueError):
            storage.upload(uri="", data=b"x")

    def test_upload_rejects_non_string_uri(self):
        storage = LocalStorage()
        with pytest.raises(ValueError):
            storage.upload(uri=None, data=b"x")  # type: ignore[arg-type]

    def test_upload_rejects_non_bytes_non_filelike_data(self):
        storage = LocalStorage()
        with pytest.raises(TypeError):
            storage.upload(uri="s3://b/k", data="plain-string")  # type: ignore[arg-type]

    def test_upload_accepts_file_like(self):
        storage = LocalStorage()
        storage.upload(uri="s3://b/k", data=io.BytesIO(b"from-file"))

        assert storage.download("s3://b/k") == b"from-file"

    def test_size_reports_byte_length(self):
        storage = LocalStorage()
        storage.upload(uri="s3://b/k", data=b"12345")

        assert storage.size("s3://b/k") == 5
        assert storage.size("s3://b/missing") == 0

    def test_clear_wipes_everything(self):
        storage = LocalStorage()
        storage.upload(uri="s3://b/k1", data=b"a")
        storage.upload(uri="s3://b/k2", data=b"b")

        storage.clear()

        assert storage.exists("s3://b/k1") is False
        assert storage.exists("s3://b/k2") is False

    def test_local_storage_is_an_object_storage(self):
        """Static check: `LocalStorage` is a valid ObjectStorage subclass."""
        assert issubclass(LocalStorage, ObjectStorage)
        assert isinstance(LocalStorage(), ObjectStorage)
