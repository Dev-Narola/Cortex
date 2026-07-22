import uuid

from src.ingestion.domain.entities import ParsedDocument
from src.ingestion.infrastructure.parser import DocumentParser


class MarkdownParser(DocumentParser):
    def parse(self, document_id: uuid.UUID, file_bytes: bytes, mime_type: str) -> ParsedDocument:
        if mime_type != "text/markdown":
            raise ValueError(f"Unsupported MIME type for Markdown parser: {mime_type}")

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
        
        # By preserving the raw text we preserve markdown headers and structural 
        # semantics for the downstream chunking layer to process and add to chunk metadata.
        metadata = {
            "parser": "markdown"
        }
        
        return ParsedDocument(document_id=document_id, text=text, metadata=metadata)
