import uuid
import pytest
from unittest.mock import Mock, patch, AsyncMock

from src.ingestion.application.reprocess import ReprocessDocumentService
from src.ingestion.application.status_transition import DocumentStatusTransitionService


@pytest.fixture
def repository():
    return Mock()

@pytest.fixture
def transition_service(repository):
    return DocumentStatusTransitionService(repository)

@pytest.fixture
def queue():
    q = Mock()
    q.enqueue = AsyncMock()
    return q

def test_execute_retry(repository, transition_service, queue):
    tenant_id = uuid.uuid4()
    doc_id = uuid.uuid4()
    
    with patch.object(transition_service, 'retry') as mock_retry, \
         patch("asyncio.run") as mock_asyncio_run, \
         patch("asyncio.get_event_loop") as mock_get_loop, \
         patch("src.core.cache.invalidate_cache", new_callable=AsyncMock) as mock_invalidate:
        
        import asyncio
        # Actually run the coroutine in the test loop
        def run_coro(coro):
            loop = asyncio.new_event_loop()
            return loop.run_until_complete(coro)
            
        mock_asyncio_run.side_effect = run_coro
        # Force fallback to asyncio.run
        mock_get_loop.side_effect = RuntimeError("No loop")
        
        service = ReprocessDocumentService(
            repository=repository,
            transition_service=transition_service,
            queue=queue
        )
        
        service.execute_retry(document_id=doc_id, tenant_id=tenant_id)
        
        mock_retry.assert_called_once_with(doc_id, tenant_id=tenant_id)
        queue.enqueue.assert_called_once_with(
            "ingest_document_task",
            document_id=str(doc_id),
            tenant_id=str(tenant_id),
        )

def test_execute_reprocess(repository, transition_service, queue):
    tenant_id = uuid.uuid4()
    doc_id = uuid.uuid4()
    
    with patch.object(transition_service, 'reprocess') as mock_reprocess, \
         patch("asyncio.run") as mock_asyncio_run, \
         patch("asyncio.get_event_loop") as mock_get_loop, \
         patch("src.core.cache.invalidate_cache", new_callable=AsyncMock) as mock_invalidate:
             
        import asyncio
        def run_coro(coro):
            loop = asyncio.new_event_loop()
            return loop.run_until_complete(coro)
            
        mock_asyncio_run.side_effect = run_coro
        mock_get_loop.side_effect = RuntimeError("No loop")
        
        service = ReprocessDocumentService(
            repository=repository,
            transition_service=transition_service,
            queue=queue
        )
        
        service.execute_reprocess(document_id=doc_id, tenant_id=tenant_id)
        
        mock_reprocess.assert_called_once_with(doc_id, tenant_id=tenant_id)
        queue.enqueue.assert_called_once_with(
            "ingest_document_task",
            document_id=str(doc_id),
            tenant_id=str(tenant_id),
        )
