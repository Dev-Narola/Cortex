import uuid
from unittest.mock import MagicMock, patch

import pytest

from src.ingestion.infrastructure.parsers.docx import DocxParser
from src.ingestion.infrastructure.parsers.markdown import MarkdownParser
from src.ingestion.infrastructure.parsers.pdf import PDFParser
from src.ingestion.infrastructure.parsers.text import TextParser


def test_text_parser():
    parser = TextParser()
    doc_id = uuid.uuid4()
    
    # Test UTF-8 with windows line endings
    content = b"Line 1\r\nLine 2\rLine 3"
    parsed = parser.parse(doc_id, content, "text/plain")
    
    assert parsed.document_id == doc_id
    assert parsed.text == "Line 1\nLine 2\nLine 3"
    assert parsed.metadata["parser"] == "text"


def test_markdown_parser():
    parser = MarkdownParser()
    doc_id = uuid.uuid4()
    
    content = b"# Heading 1\n\nSome text."
    parsed = parser.parse(doc_id, content, "text/markdown")
    
    assert parsed.document_id == doc_id
    assert parsed.text == "# Heading 1\n\nSome text."
    assert parsed.metadata["parser"] == "markdown"


@patch("src.ingestion.infrastructure.parsers.pdf.PdfReader")
def test_pdf_parser(mock_reader_class):
    mock_reader = MagicMock()
    
    mock_page1 = MagicMock()
    mock_page1.extract_text.return_value = "Page 1 text"
    
    mock_page2 = MagicMock()
    mock_page2.extract_text.return_value = "Page 2 text"
    
    mock_reader.pages = [mock_page1, mock_page2]
    mock_reader_class.return_value = mock_reader

    parser = PDFParser()
    doc_id = uuid.uuid4()
    
    parsed = parser.parse(doc_id, b"fake-pdf-bytes", "application/pdf")
    
    assert "--- PAGE 1 ---" in parsed.text
    assert "Page 1 text" in parsed.text
    assert "--- PAGE 2 ---" in parsed.text
    assert "Page 2 text" in parsed.text
    assert parsed.metadata["page_count"] == 2
    assert parsed.metadata["parser"] == "pdf"


@patch("src.ingestion.infrastructure.parsers.docx.docx.Document")
def test_docx_parser(mock_document_class):
    mock_doc = MagicMock()
    
    mock_p1 = MagicMock()
    mock_p1.text = "Heading 1"
    mock_p1.style.name = "Heading 1"
    
    mock_p2 = MagicMock()
    mock_p2.text = "Normal paragraph"
    mock_p2.style.name = "Normal"
    
    mock_doc.paragraphs = [mock_p1, mock_p2]
    
    # Mock a basic table
    mock_table = MagicMock()
    mock_row = MagicMock()
    mock_cell1 = MagicMock()
    mock_cell1.text = "Cell 1"
    mock_cell2 = MagicMock()
    mock_cell2.text = "Cell 2"
    mock_row.cells = [mock_cell1, mock_cell2]
    mock_table.rows = [mock_row]
    
    mock_doc.tables = [mock_table]
    
    mock_document_class.return_value = mock_doc
    
    parser = DocxParser()
    doc_id = uuid.uuid4()
    
    parsed = parser.parse(
        doc_id, 
        b"fake-docx-bytes", 
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    
    assert "# Heading 1" in parsed.text
    assert "Normal paragraph" in parsed.text
    assert "Cell 1 | Cell 2" in parsed.text
    assert parsed.metadata["parser"] == "docx"
