import pytest
import uuid
from unittest.mock import patch, Mock
from src.ingestion.infrastructure.models import DocumentModel, DocumentChunkModel
from src.ingestion.infrastructure.repositories import DocumentRepository
from src.ingestion.workers.tasks import ingest_document_task
from src.ingestion.domain.entities import Document, DocumentStatus, SourceType

def _make_document(tenant_id, user_id, mime_type="text/plain"):
    return Document.create(
        tenant_id=tenant_id,
        source_type=SourceType.UPLOAD,
        title="Test Document",
        mime_type=mime_type,
        created_by=user_id
    )

@pytest.mark.asyncio
async def test_worker_tenant_isolation(db_session, make_tenant):
    # Create two tenants
    tenant1, user1 = make_tenant()
    tenant2, user2 = make_tenant()
    
    doc1 = _make_document(tenant1.id, user1.id)
    doc1.set_storage_uri("s3://bucket/doc1.txt")
    
    doc2 = _make_document(tenant2.id, user2.id)
    doc2.set_storage_uri("s3://bucket/doc2.txt")
    
    doc_repo = DocumentRepository(db_session)
    doc_repo.create(doc1)
    doc_repo.create(doc2)
    db_session.commit()
    
    ctx = {"job_try": 1}
    
    with patch("src.ingestion.workers.tasks.get_db_session", return_value=db_session), \
         patch("src.ingestion.workers.tasks.get_storage") as mock_get_storage, \
         patch("src.ingestion.workers.tasks.invalidate_cache"):
        
        mock_storage = Mock()
        mock_storage.download.return_value = b"Document content"
        mock_get_storage.return_value = mock_storage
        
        # Process doc1 for tenant1
        await ingest_document_task(ctx, document_id=str(doc1.id), tenant_id=str(tenant1.id))
        
        # Verify tenant 1 got chunks
        chunks1 = db_session.query(DocumentChunkModel).filter_by(document_id=doc1.id).all()
        assert len(chunks1) > 0
        for c in chunks1:
            assert c.tenant_id == tenant1.id
            
        # Verify tenant 2 got NO chunks
        chunks2 = db_session.query(DocumentChunkModel).filter_by(document_id=doc2.id).all()
        assert len(chunks2) == 0
        
        # Now try to process doc1 but pass tenant2 id (cross-tenant IDOR attempt via worker).
        # The worker fetches the document scoped by both document_id AND tenant_id,
        # so it will not find it and should return a failed result — not pollute data.
        result = await ingest_document_task(ctx, document_id=str(doc1.id), tenant_id=str(tenant2.id))
        # Worker returns "not_found" when the document doesn't belong to the given tenant.
        # Either "not_found" or "failed" means the cross-tenant operation was blocked.
        assert result["status"] in ("not_found", "failed"), (
            f"Worker must reject cross-tenant access, got: {result['status']}"
        )
            
        # Verify no cross-contamination: tenant1's chunks are untouched
        chunks_after = db_session.query(DocumentChunkModel).filter_by(document_id=doc1.id).all()
        assert len(chunks_after) == len(chunks1), "Cross-tenant call must not remove original chunks"
        for c in chunks_after:
            assert c.tenant_id == tenant1.id

