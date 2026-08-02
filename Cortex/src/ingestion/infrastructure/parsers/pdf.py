import io
import uuid
from typing import Any

from pypdf import PdfReader

from src.ingestion.domain.entities import ParsedDocument
from src.ingestion.infrastructure.parser import DocumentParser


class PDFParser(DocumentParser):
    def parse(self, document_id: uuid.UUID, file_bytes: bytes, mime_type: str) -> ParsedDocument:
        if mime_type != "application/pdf":
            raise ValueError(f"Unsupported MIME type for PDF parser: {mime_type}")

        reader = PdfReader(io.BytesIO(file_bytes))
        
        texts = []
        page_count = len(reader.pages)
        
        # We preserve page boundaries by marking them explicitly.
        # The chunker can then parse these boundaries to assign page_start/page_end.
        for i, page in enumerate(reader.pages):
            text = page.extract_text()
            if text and text.strip():
                # Encode page boundary in a predictable format for the chunker
                texts.append(f"--- PAGE {i+1} ---\n{text.strip()}")

        full_text = "\n\n".join(texts)
        
        metadata = {
            "page_count": page_count,
            "parser": "pdf"
        }
        
        return ParsedDocument(document_id=document_id, text=full_text, metadata=metadata)
