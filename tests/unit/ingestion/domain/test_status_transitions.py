import uuid
import pytest
from src.ingestion.domain.entities import DocumentStatus, is_valid_transition, Document
from src.ingestion.domain.exceptions import DocumentStateException
from src.shared.exceptions import ValidationException

def test_valid_transitions():
    assert is_valid_transition(DocumentStatus.PENDING, DocumentStatus.PARSING) is True
    assert is_valid_transition(DocumentStatus.PENDING, DocumentStatus.FAILED) is True
    
    assert is_valid_transition(DocumentStatus.PARSING, DocumentStatus.CHUNKING) is True
    assert is_valid_transition(DocumentStatus.PARSING, DocumentStatus.FAILED) is True
    
    assert is_valid_transition(DocumentStatus.CHUNKING, DocumentStatus.EMBEDDING) is True
    assert is_valid_transition(DocumentStatus.CHUNKING, DocumentStatus.FAILED) is True
    
    assert is_valid_transition(DocumentStatus.EMBEDDING, DocumentStatus.INDEXED) is True
    assert is_valid_transition(DocumentStatus.EMBEDDING, DocumentStatus.FAILED) is True
    
    assert is_valid_transition(DocumentStatus.INDEXED, DocumentStatus.PARSING) is True
    assert is_valid_transition(DocumentStatus.INDEXED, DocumentStatus.FAILED) is True
    
    assert is_valid_transition(DocumentStatus.FAILED, DocumentStatus.PENDING) is True
    assert is_valid_transition(DocumentStatus.FAILED, DocumentStatus.PARSING) is True

def test_invalid_transitions():
    # Cannot jump forward
    assert is_valid_transition(DocumentStatus.PENDING, DocumentStatus.CHUNKING) is False
    assert is_valid_transition(DocumentStatus.PENDING, DocumentStatus.INDEXED) is False
    
    # Cannot go backwards outside of retry logic
    assert is_valid_transition(DocumentStatus.CHUNKING, DocumentStatus.PARSING) is False
    assert is_valid_transition(DocumentStatus.INDEXED, DocumentStatus.CHUNKING) is False
    
    # Cannot self-transition except via explicit paths (no self transitions are allowed)
    assert is_valid_transition(DocumentStatus.PENDING, DocumentStatus.PENDING) is False
    assert is_valid_transition(DocumentStatus.FAILED, DocumentStatus.FAILED) is False

def test_document_transition_methods():
    doc = Document.create(
        tenant_id=uuid.uuid4(),
        source_type="upload",
        title="Test",
        mime_type="text/plain",
        created_by=uuid.uuid4(),
        status=DocumentStatus.PENDING,
    )
    
    # pending -> parsing
    doc.mark_parsing()
    assert doc.status == DocumentStatus.PARSING
    
    # parsing -> chunking
    doc.mark_chunking()
    assert doc.status == DocumentStatus.CHUNKING
    
    # chunking -> embedding
    doc.mark_embedding()
    assert doc.status == DocumentStatus.EMBEDDING
    
    # embedding -> indexed
    doc.mark_indexed()
    assert doc.status == DocumentStatus.INDEXED
    
    # indexed -> parsing (via reprocess)
    doc.bump_version()
    doc._transition(DocumentStatus.PARSING)
    assert doc.status == DocumentStatus.PARSING
    
    # parsing -> failed
    doc.mark_failed()
    assert doc.status == DocumentStatus.FAILED
    
    # failed -> pending (via requeue)
    doc.requeue()
    assert doc.status == DocumentStatus.PENDING

def test_document_invalid_transition_raises():
    doc = Document.create(
        tenant_id=uuid.uuid4(),
        source_type="upload",
        title="Test",
        mime_type="text/plain",
        created_by=uuid.uuid4(),
        status=DocumentStatus.PENDING,
    )
    
    # pending -> chunking is invalid
    with pytest.raises(DocumentStateException):
        doc.mark_chunking()
        
    with pytest.raises(DocumentStateException):
        doc.mark_indexed()

def test_requeue_idempotent():
    doc = Document.create(
        tenant_id=uuid.uuid4(),
        source_type="upload",
        title="Test",
        mime_type="text/plain",
        created_by=uuid.uuid4(),
        status=DocumentStatus.PENDING,
    )
    
    # Requeuing a pending document is a no-op
    doc.requeue()
    assert doc.status == DocumentStatus.PENDING
