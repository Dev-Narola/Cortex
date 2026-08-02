import uuid
import pytest
from unittest.mock import Mock, patch

from src.ingestion.infrastructure.parsers.pdf import PDFParser


def test_pdf_parser_success():
    parser = PDFParser()
    doc_id = uuid.uuid4()
    
    with patch('src.ingestion.infrastructure.parsers.pdf.PdfReader') as mock_reader_class:
        mock_reader = Mock()
        mock_reader_class.return_value = mock_reader
        
        # Mock 2 pages
        mock_page1 = Mock()
        mock_page1.extract_text.return_value = "Page 1 content."
        mock_page2 = Mock()
        mock_page2.extract_text.return_value = "Page 2 content."
        
        mock_reader.pages = [mock_page1, mock_page2]
        
        parsed = parser.parse(document_id=doc_id, file_bytes=b"fake_pdf_bytes", mime_type="application/pdf")
        
        assert parsed.document_id == doc_id
        assert "--- PAGE 1 ---" in parsed.text
        assert "Page 1 content." in parsed.text
        assert "--- PAGE 2 ---" in parsed.text
        assert "Page 2 content." in parsed.text
        
        assert parsed.metadata["page_count"] == 2
        assert parsed.metadata["parser"] == "pdf"


def test_pdf_parser_invalid_mime_type():
    parser = PDFParser()
    with pytest.raises(ValueError, match="Unsupported MIME type"):
        parser.parse(document_id=uuid.uuid4(), file_bytes=b"fake", mime_type="text/plain")


def test_pdf_parser_empty_pages():
    parser = PDFParser()
    doc_id = uuid.uuid4()
    
    with patch('src.ingestion.infrastructure.parsers.pdf.PdfReader') as mock_reader_class:
        mock_reader = Mock()
        mock_reader_class.return_value = mock_reader
        
        # Mock 2 pages, one empty
        mock_page1 = Mock()
        mock_page1.extract_text.return_value = " "
        mock_page2 = Mock()
        mock_page2.extract_text.return_value = "Page 2 content."
        
        mock_reader.pages = [mock_page1, mock_page2]
        
        parsed = parser.parse(document_id=doc_id, file_bytes=b"fake_pdf_bytes", mime_type="application/pdf")
        
        assert "--- PAGE 1 ---" not in parsed.text
        assert "--- PAGE 2 ---" in parsed.text
        assert "Page 2 content." in parsed.text
        
        assert parsed.metadata["page_count"] == 2
