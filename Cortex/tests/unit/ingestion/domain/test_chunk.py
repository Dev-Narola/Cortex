import uuid
from datetime import datetime
from src.ingestion.domain.entities import Chunk

def test_chunk_creation():
    doc_id = uuid.uuid4()
    ten_id = uuid.uuid4()
    
    chunk = Chunk(
        document_id=doc_id,
        tenant_id=ten_id,
        content="Test content",
        chunk_index=1,
        token_count=2,
    )
    
    assert chunk.document_id == doc_id
    assert chunk.tenant_id == ten_id
    assert chunk.content == "Test content"
    assert chunk.chunk_index == 1
    assert chunk.token_count == 2
    assert isinstance(chunk.id, uuid.UUID)
    assert isinstance(chunk.created_at, datetime)
    assert chunk.metadata == {}

def test_chunk_with_metadata():
    chunk = Chunk(
        document_id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        content="Testing",
        chunk_index=0,
        token_count=1,
        metadata={"page_start": 1, "page_end": 2}
    )
    
    assert chunk.metadata == {"page_start": 1, "page_end": 2}
