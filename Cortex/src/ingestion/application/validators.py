import os
from typing import BinaryIO

from src.core.config import settings
from src.shared.exceptions import ValidationException


class FileValidator:
    """
    Validates uploaded files for the ingestion pipeline.
    Enforces MIME types, file extensions, and file sizes.
    """

    ALLOWED_MIME_TYPES = {
        "application/pdf",
        "text/plain",
        "text/markdown",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }

    ALLOWED_EXTENSIONS = {
        ".pdf",
        ".txt",
        ".md",
        ".docx",
    }

    @classmethod
    def validate_file(cls, filename: str, mime_type: str, file_obj: BinaryIO) -> None:
        """
        Validates the file against ingestion policies.

        Args:
            filename: The original name of the file.
            mime_type: The MIME type provided by the request.
            file_obj: The actual file stream (to check size).

        Raises:
            ValidationException: If the file violates any policy.
        """
        if not filename:
            raise ValidationException(
                message="Filename is required.",
                code=400,
                data={"field": "filename"},
            )

        # Extension check
        ext = os.path.splitext(filename)[1].lower()
        if ext not in cls.ALLOWED_EXTENSIONS:
            raise ValidationException(
                message=f"Unsupported file extension: {ext}",
                code=400,
                data={
                    "field": "filename",
                    "extension": ext,
                    "allowed": list(cls.ALLOWED_EXTENSIONS),
                },
            )

        # MIME type check
        if mime_type not in cls.ALLOWED_MIME_TYPES:
            raise ValidationException(
                message=f"Unsupported MIME type: {mime_type}",
                code=400,
                data={
                    "field": "mime_type",
                    "mime_type": mime_type,
                    "allowed": list(cls.ALLOWED_MIME_TYPES),
                },
            )

        # Size check
        file_obj.seek(0, os.SEEK_END)
        size_bytes = file_obj.tell()
        file_obj.seek(0)  # Reset pointer for subsequent reads

        if size_bytes == 0:
            raise ValidationException(
                message="File cannot be empty.",
                code=400,
                data={"field": "file", "size": size_bytes},
            )

        if size_bytes > settings.MAX_DOCUMENT_SIZE_BYTES:
            raise ValidationException(
                message=(
                    f"File exceeds maximum allowed size of "
                    f"{settings.MAX_DOCUMENT_SIZE_BYTES} bytes."
                ),
                code=400,
                data={
                    "field": "file",
                    "size": size_bytes,
                    "max_size": settings.MAX_DOCUMENT_SIZE_BYTES,
                },
            )
