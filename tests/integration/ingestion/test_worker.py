import uuid
import pytest
from unittest.mock import Mock, patch
from datetime import datetime, UTC

from src.ingestion.workers.tasks import ingest_document_task
from src.ingestion.domain.entities import Document, DocumentStatus, SourceType
from src.ingestion.workers.dependencies import ChunkRepository, ProcessingAttemptRepository, DocumentRepository
from src.ingestion.workers.errors import PermanentWorkerError


def _make_document(tenant_id: uuid.UUID, user_id: uuid.UUID, **overrides) -> Document:
    kwargs = dict(
        tenant_id=tenant_id,
        source_type=SourceType.UPLOAD,
        title=f"Doc-{uuid.uuid4().hex[:6]}.txt",
        mime_type="text/plain",
        created_by=user_id,
    )
    kwargs.update(overrides)
    return Document.create(**kwargs)


@pytest.mark.asyncio
async def test_worker_success_path(db_session, make_tenant):
    tenant, user = make_tenant()
    doc = _make_document(tenant.id, user.id)
    doc.set_storage_uri("s3://bucket/doc.txt")
    
    doc_repo = DocumentRepository(db_session)
    doc_repo.create(doc)
    db_session.commit()
    
    ctx = {"job_try": 1}
    
    with patch("src.ingestion.workers.tasks.get_db_session", return_value=db_session), \
         patch("src.ingestion.workers.tasks.get_storage") as mock_get_storage, \
         patch("src.ingestion.workers.tasks.invalidate_cache") as mock_invalidate_cache:
        
        mock_storage = Mock()
        mock_storage.download.return_value = b"Hello world! This is a test document with a few words."
        mock_get_storage.return_value = mock_storage
        
        result = await ingest_document_task(ctx, document_id=str(doc.id), tenant_id=str(tenant.id))
        
        # The pipeline now halts at 'embedding' after chunking.
        # embed_chunks_task is enqueued separately as a background job.
        assert result["status"] == "embedding"
        assert result["chunk_count"] > 0
        mock_invalidate_cache.assert_called()
        
        # Verify db state: document should be in EMBEDDING status
        updated_doc = doc_repo.get_by_id(doc.id, tenant_id=tenant.id)
        assert updated_doc.status == DocumentStatus.EMBEDDING
        
        from src.ingestion.infrastructure.models import DocumentChunkModel, DocumentProcessingAttemptModel
        chunks = db_session.query(DocumentChunkModel).filter_by(document_id=doc.id).all()
        assert len(chunks) == result["chunk_count"]


@pytest.mark.asyncio
async def test_worker_idempotency(db_session, make_tenant):
    # If run twice, it should replace chunks
    tenant, user = make_tenant()
    doc = _make_document(tenant.id, user.id)
    doc.set_storage_uri("s3://bucket/doc.txt")
    
    doc_repo = DocumentRepository(db_session)
    doc_repo.create(doc)
    db_session.commit()
    
    ctx = {"job_try": 1}
    
    with patch("src.ingestion.workers.tasks.get_db_session", return_value=db_session), \
         patch("src.ingestion.workers.tasks.get_storage") as mock_get_storage, \
         patch("src.ingestion.workers.tasks.invalidate_cache"):
        
        mock_storage = Mock()
        mock_storage.download.return_value = b"First run content."
        mock_get_storage.return_value = mock_storage
        
        await ingest_document_task(ctx, document_id=str(doc.id), tenant_id=str(tenant.id))
        
        from src.ingestion.infrastructure.models import DocumentChunkModel
        chunks_run1 = db_session.query(DocumentChunkModel).filter_by(document_id=doc.id).all()
        assert len(chunks_run1) > 0
        run1_ids = {c.id for c in chunks_run1}
        
        # Reset doc status to pending for rerun
        doc_repo.update_status(doc.id, tenant_id=tenant.id, status=DocumentStatus.PENDING)
        db_session.commit()
        
        # Second run
        mock_storage.download.return_value = b"Second run content. Longer."
        await ingest_document_task(ctx, document_id=str(doc.id), tenant_id=str(tenant.id))
        
        chunks_run2 = db_session.query(DocumentChunkModel).filter_by(document_id=doc.id).all()
        assert len(chunks_run2) > 0
        run2_ids = {c.id for c in chunks_run2}
        assert run1_ids.isdisjoint(run2_ids) # To ensure it replaced them


@pytest.mark.asyncio
async def test_worker_permanent_failure(db_session, make_tenant):
    tenant, user = make_tenant()
    doc = _make_document(tenant.id, user.id, mime_type="text/plain")
    doc.set_storage_uri("s3://bucket/doc.bin")
    
    doc_repo = DocumentRepository(db_session)
    doc_repo.create(doc)
    db_session.commit()
    
    ctx = {"job_try": 1}
    
    with patch("src.ingestion.workers.tasks.get_db_session", return_value=db_session), \
         patch("src.ingestion.workers.tasks.get_storage") as mock_get_storage, \
         patch("src.ingestion.workers.tasks.parser_registry") as mock_registry, \
         patch("src.ingestion.workers.tasks.invalidate_cache"):
        
        mock_storage = Mock()
        mock_storage.download.return_value = b"fake data"
        mock_get_storage.return_value = mock_storage
        
        # Mock parser to raise a permanent error (Exception becomes ParserError which is permanent)
        mock_parser = Mock()
        mock_parser.parse.side_effect = Exception("Simulated parsing failure")
        mock_registry.get.return_value = mock_parser
        
        result = await ingest_document_task(ctx, document_id=str(doc.id), tenant_id=str(tenant.id))
        
        assert result["status"] == "failed"
        
        updated_doc = doc_repo.get_by_id(doc.id, tenant_id=tenant.id)
        assert updated_doc.status == DocumentStatus.FAILED
        
        from src.ingestion.infrastructure.models import DocumentModel, DocumentProcessingAttemptModel
        row = db_session.get(DocumentModel, doc.id)
        assert "Simulated parsing failure" in row.last_error
        
        attempts = db_session.query(DocumentProcessingAttemptModel).filter_by(document_id=doc.id).all()
        assert len(attempts) == 1
        assert attempts[0].status == "failed"
