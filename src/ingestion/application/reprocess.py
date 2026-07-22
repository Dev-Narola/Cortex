"""
ReprocessDocumentService — handle explicit document retries and reprocessing.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import Depends

from src.ingestion.application.services import QueueClient
from src.ingestion.application.status_transition import DocumentStatusTransitionService
from src.ingestion.infrastructure.repositories import DocumentRepository
from src.ingestion.interface.rest.queue import get_arq_queue
from src.platform.database import get_db


class ReprocessDocumentService:
    """
    Service to queue an existing document for reprocessing.

    Can be used either to retry a `failed` document or force a re-run
    of an `indexed` document (e.g. after updating chunking logic).
    """

    def __init__(
        self,
        repository: DocumentRepository,
        transition_service: DocumentStatusTransitionService,
        queue: QueueClient,
    ) -> None:
        self.repository = repository
        self.transition_service = transition_service
        self.queue = queue

    def execute_retry(self, document_id: uuid.UUID, *, tenant_id: uuid.UUID) -> None:
        """
        Retry a FAILED document.
        Validates the document is failed and resets its status to pending.
        """
        self.transition_service.retry(document_id, tenant_id=tenant_id)
        self._enqueue(document_id, tenant_id=tenant_id)

    def execute_reprocess(self, document_id: uuid.UUID, *, tenant_id: uuid.UUID) -> None:
        """
        Reprocess an INDEXED document.
        Validates the document is indexed, bumps its version, and resets to pending.
        """
        self.transition_service.reprocess(document_id, tenant_id=tenant_id)
        self._enqueue(document_id, tenant_id=tenant_id)

    def _enqueue(self, document_id: uuid.UUID, *, tenant_id: uuid.UUID) -> None:
        import asyncio
        from src.platform.cache import invalidate_cache

        # Invalidate cache since status was reset to PENDING
        cache_key = f"doc_status:{document_id}"
        
        async def run_tasks():
            await invalidate_cache(cache_key)
            await self.queue.enqueue(
                "ingest_document_task",
                document_id=str(document_id),
                tenant_id=str(tenant_id),
            )
            
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # In FastAPI route threads, the loop is not running.
                # However, if it happens to be running (e.g. tests), create a task.
                loop.create_task(run_tasks())
            else:
                loop.run_until_complete(run_tasks())
        except RuntimeError:
            asyncio.run(run_tasks())


def get_reprocess_document_service(
    session=Depends(get_db),
    queue: QueueClient = Depends(get_arq_queue),
) -> ReprocessDocumentService:
    repository = DocumentRepository(session)
    transition_service = DocumentStatusTransitionService(repository)
    return ReprocessDocumentService(
        repository=repository,
        transition_service=transition_service,
        queue=queue,
    )
