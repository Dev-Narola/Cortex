from src.ingestion.infrastructure.parser import DocumentParser
from src.ingestion.infrastructure.parsers import (
    DocxParser,
    MarkdownParser,
    PDFParser,
    TextParser,
)


class ParserRegistry:
    """
    Registry for resolving the correct DocumentParser based on MIME type.
    """

    def __init__(self):
        self._parsers: dict[str, DocumentParser] = {
            "application/pdf": PDFParser(),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document": DocxParser(),
            "text/plain": TextParser(),
            "text/markdown": MarkdownParser(),
        }

    def get(self, mime_type: str) -> DocumentParser:
        """
        Get the parser for the given MIME type.

        Args:
            mime_type: The MIME type of the document.

        Returns:
            The corresponding DocumentParser.

        Raises:
            ValueError: If no parser is registered for the MIME type.
        """
        parser = self._parsers.get(mime_type)
        if not parser:
            raise ValueError(f"No parser registered for MIME type: {mime_type}")
        return parser


# Singleton instance for general use
parser_registry = ParserRegistry()
