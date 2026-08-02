import uuid
import pytest

from src.ingestion.infrastructure.parsers.text import TextParser


def test_text_parser_success():
    parser = TextParser()
    doc_id = uuid.uuid4()
    
    file_bytes = b"Hello world!\r\nThis is a test."
    parsed = parser.parse(document_id=doc_id, file_bytes=file_bytes, mime_type="text/plain")
    
    assert parsed.document_id == doc_id
    assert parsed.text == "Hello world!\nThis is a test."
    assert parsed.metadata["parser"] == "text"


def test_text_parser_invalid_mime_type():
    parser = TextParser()
    with pytest.raises(ValueError, match="Unsupported MIME type"):
        parser.parse(document_id=uuid.uuid4(), file_bytes=b"fake", mime_type="application/pdf")


def test_text_parser_encodings():
    parser = TextParser()
    doc_id = uuid.uuid4()
    
    # latin-1
    file_bytes = "café".encode("latin-1")
    parsed = parser.parse(document_id=doc_id, file_bytes=file_bytes, mime_type="text/plain")
    assert parsed.text == "café"
    
    # utf-8
    file_bytes = "café".encode("utf-8")
    parsed = parser.parse(document_id=doc_id, file_bytes=file_bytes, mime_type="text/plain")
    assert parsed.text == "café"
