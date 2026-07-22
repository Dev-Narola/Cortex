import io

import pytest

from src.ingestion.application.validators import FileValidator
from src.platform.config import settings
from src.shared.exceptions import ValidationException


def test_validator_accepts_valid_pdf():
    file_obj = io.BytesIO(b"dummy pdf content")
    # Should not raise
    FileValidator.validate_file(
        filename="test.pdf",
        mime_type="application/pdf",
        file_obj=file_obj,
    )


def test_validator_rejects_empty_filename():
    file_obj = io.BytesIO(b"content")
    with pytest.raises(ValidationException) as exc:
        FileValidator.validate_file(
            filename="",
            mime_type="text/plain",
            file_obj=file_obj,
        )
    assert exc.value.data["field"] == "filename"


def test_validator_rejects_invalid_extension():
    file_obj = io.BytesIO(b"content")
    with pytest.raises(ValidationException) as exc:
        FileValidator.validate_file(
            filename="virus.exe",
            mime_type="application/pdf",
            file_obj=file_obj,
        )
    assert "extension" in str(exc.value).lower()


def test_validator_rejects_invalid_mime_type():
    file_obj = io.BytesIO(b"content")
    with pytest.raises(ValidationException) as exc:
        FileValidator.validate_file(
            filename="test.pdf",
            mime_type="application/octet-stream",
            file_obj=file_obj,
        )
    assert "mime type" in str(exc.value).lower()


def test_validator_rejects_empty_file():
    file_obj = io.BytesIO(b"")
    with pytest.raises(ValidationException) as exc:
        FileValidator.validate_file(
            filename="test.pdf",
            mime_type="application/pdf",
            file_obj=file_obj,
        )
    assert exc.value.data["size"] == 0


def test_validator_rejects_oversized_file():
    # We can mock the file size by overriding tell() or creating a large buffer
    # Or simpler: temporarily override settings
    old_size = settings.MAX_DOCUMENT_SIZE_BYTES
    settings.MAX_DOCUMENT_SIZE_BYTES = 10  # 10 bytes max
    try:
        file_obj = io.BytesIO(b"this is more than 10 bytes")
        with pytest.raises(ValidationException) as exc:
            FileValidator.validate_file(
                filename="test.pdf",
                mime_type="application/pdf",
                file_obj=file_obj,
            )
        assert exc.value.data["size"] > 10
    finally:
        settings.MAX_DOCUMENT_SIZE_BYTES = old_size
