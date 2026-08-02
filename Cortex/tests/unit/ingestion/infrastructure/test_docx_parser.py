import uuid
import pytest
from unittest.mock import Mock, patch

from src.ingestion.infrastructure.parsers.docx import DocxParser


def test_docx_parser_success():
    parser = DocxParser()
    doc_id = uuid.uuid4()
    
    with patch('src.ingestion.infrastructure.parsers.docx.docx.Document') as mock_doc_class:
        mock_doc = Mock()
        mock_doc_class.return_value = mock_doc
        
        mock_p1 = Mock()
        mock_p1.text = "Heading text"
        mock_p1.style.name = "Heading 2"
        
        mock_p2 = Mock()
        mock_p2.text = "Paragraph text."
        mock_p2.style.name = "Normal"
        
        mock_p3 = Mock()
        mock_p3.text = "   " # Empty text
        
        mock_doc.paragraphs = [mock_p1, mock_p2, mock_p3]
        
        mock_row1 = Mock()
        mock_cell1 = Mock()
        mock_cell1.text = "Cell 1"
        mock_cell2 = Mock()
        mock_cell2.text = "Cell 2"
        mock_row1.cells = [mock_cell1, mock_cell2]
        
        mock_table1 = Mock()
        mock_table1.rows = [mock_row1]
        
        mock_doc.tables = [mock_table1]
        
        parsed = parser.parse(document_id=doc_id, file_bytes=b"fake", mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        
        assert parsed.document_id == doc_id
        assert "## Heading text" in parsed.text
        assert "Paragraph text." in parsed.text
        assert "Cell 1 | Cell 2" in parsed.text
        assert parsed.metadata["parser"] == "docx"


def test_docx_parser_invalid_mime_type():
    parser = DocxParser()
    with pytest.raises(ValueError, match="Unsupported MIME type"):
        parser.parse(document_id=uuid.uuid4(), file_bytes=b"fake", mime_type="text/plain")
