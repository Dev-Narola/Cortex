import uuid

import pytest

from src.ingestion.infrastructure.parser_registry import ParserRegistry


def test_registry_resolves_pdf():
    registry = ParserRegistry()
    parser = registry.get("application/pdf")
    assert parser is not None
    assert type(parser).__name__ == "PDFParser"


def test_registry_resolves_docx():
    registry = ParserRegistry()
    parser = registry.get(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    assert parser is not None
    assert type(parser).__name__ == "DocxParser"


def test_registry_resolves_text():
    registry = ParserRegistry()
    parser = registry.get("text/plain")
    assert parser is not None
    assert type(parser).__name__ == "TextParser"


def test_registry_resolves_markdown():
    registry = ParserRegistry()
    parser = registry.get("text/markdown")
    assert parser is not None
    assert type(parser).__name__ == "MarkdownParser"


def test_registry_raises_on_unknown_mime():
    registry = ParserRegistry()
    with pytest.raises(ValueError, match="No parser registered"):
        registry.get("image/png")
