import uuid
import pytest

from src.ingestion.infrastructure.parsers.markdown import MarkdownParser


def test_markdown_parser_success():
    parser = MarkdownParser()
    doc_id = uuid.uuid4()
    
    file_bytes = b"# Heading 1\r\nThis is a test."
    parsed = parser.parse(document_id=doc_id, file_bytes=file_bytes, mime_type="text/markdown")
    
    assert parsed.document_id == doc_id
    assert parsed.text == "# Heading 1\nThis is a test."
    assert parsed.metadata["parser"] == "markdown"


def test_markdown_parser_invalid_mime_type():
    parser = MarkdownParser()
    with pytest.raises(ValueError, match="Unsupported MIME type"):
        parser.parse(document_id=uuid.uuid4(), file_bytes=b"fake", mime_type="application/pdf")
