"""
Parser abstraction for extracting text from raw documents.
"""

import uuid
from abc import ABC, abstractmethod

from src.ingestion.domain.entities import ParsedDocument


class DocumentParser(ABC):
    """
    Abstract interface for parsing raw document bytes into a ParsedDocument.
    """

    @abstractmethod
    def parse(
        self, document_id: uuid.UUID, file_bytes: bytes, mime_type: str
    ) -> ParsedDocument:
        """
        Parse raw bytes of a document into extracted text and metadata.

        Args:
            document_id: The UUID of the document being parsed.
            file_bytes: The raw bytes of the document.
            mime_type: The MIME type of the document (e.g., 'application/pdf').

        Returns:
            A ParsedDocument containing the extracted text and any available metadata.

        Raises:
            Exception: If parsing fails or the MIME type is unsupported.
        """
        pass
