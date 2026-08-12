import io
from pathlib import Path
import sys
import uuid

# Ensure project root is in sys.path for local and container runtime
PROJECT_ROOT = Path(__file__).resolve().parents[3]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.ingestion.infrastructure.parser import DocumentParser
from src.ingestion.infrastructure.parsers.docx import DocxParser
from src.ingestion.infrastructure.parsers.markdown import MarkdownParser
from src.ingestion.infrastructure.parsers.pdf import PDFParser
from src.ingestion.infrastructure.parsers.text import TextParser


class ParserRegistry:
    """Registry for resolving the correct DocumentParser based on MIME type."""

    def __init__(self):
        self._parsers: dict[str, DocumentParser] = {
            "application/pdf": PDFParser(),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document": DocxParser(),
            "text/plain": TextParser(),
            "text/markdown": MarkdownParser(),
        }

    def get(self, mime_type: str) -> DocumentParser:
        parser = self._parsers.get(mime_type)
        if not parser:
            raise ValueError(f"No parser registered for MIME type: {mime_type}")
        return parser


parser_registry = ParserRegistry()
