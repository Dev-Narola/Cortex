import uuid

from src.ingestion.domain.entities import ParsedDocument
from src.ingestion.infrastructure.parser import DocumentParser


class TextParser(DocumentParser):
    def parse(self, document_id: uuid.UUID, file_bytes: bytes, mime_type: str) -> ParsedDocument:
        if mime_type != "text/plain":
            raise ValueError(f"Unsupported MIME type for TXT parser: {mime_type}")

        # Attempt to decode with multiple encodings
        encodings = ['utf-8-sig', 'utf-8', 'latin-1']
        text = ""
        for enc in encodings:
            try:
                text = file_bytes.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        
        # Normalize line endings
        text = text.replace('\r\n', '\n').replace('\r', '\n')
        
        metadata = {
            "parser": "text"
        }
        
        return ParsedDocument(document_id=document_id, text=text, metadata=metadata)
