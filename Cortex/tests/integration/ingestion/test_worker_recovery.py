"""Ingestion recovery regressions (audit H10, M2, H15, reprocess-commit bug)."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, Mock, patch

import pytest

from src.ingestion.application.reprocess import get_reprocess_document_service
from src.ingestion.domain.entities import Document, DocumentStatus, SourceType
from src.ingestion.infrastructure.models import DocumentChunkModel, DocumentModel
from src.ingestion.workers.dependencies import DocumentRepository
from src.ingestion.workers.tasks import ingest_document_task


def _doc(db_session, make_tenant, status: DocumentStatus) -> tuple[Document, uuid.UUID]:
    tenant, user = make_tenant()
    doc = Document.create(
        tenant_id=tenant.id,
        source_type=SourceType.UPLOAD,
        title="notes.txt",
        mime_type="text/plain",
        created_by=user.id,
    )
    doc.set_storage_uri("s3://bucket/notes.txt")
    DocumentRepository(db_session).create(doc)
    db_session.query(DocumentModel).filter_by(id=doc.id).update({"status": status.value})
    db_session.commit()
    return doc, tenant.id


async def _run(db_session, doc, tenant_id, job_try: int) -> dict:
    storage = Mock()
    storage.download.return_value = b"Cortex stores vectors in pgvector. " * 20
    with patch("src.ingestion.workers.tasks.get_db_session", return_value=db_session), \
         patch("src.ingestion.workers.tasks.get_storage", return_value=storage), \
         patch("src.ingestion.workers.tasks.invalidate_cache"):
        return await ingest_document_task(
            {"job_try": job_try}, document_id=str(doc.id), tenant_id=str(tenant_id)
        )


@pytest.mark.asyncio
async def test_retry_of_crashed_job_resumes_a_parsing_document(db_session, make_tenant):
    """The worker died after claiming the document; arq re-runs the job."""
    doc, tenant_id = _doc(db_session, make_tenant, DocumentStatus.PARSING)

    first = await _run(db_session, doc, tenant_id, job_try=2)
    assert first["status"] == "embedding"
    again = await _run(db_session, doc, tenant_id, job_try=2)
    assert again["status"] == "skipped"  # already moved on: no second pipeline run
    count = db_session.query(DocumentChunkModel).filter_by(document_id=doc.id).count()
    assert count == first["chunk_count"]


@pytest.mark.asyncio
async def test_first_try_never_steals_an_in_progress_document(db_session, make_tenant):
    doc, tenant_id = _doc(db_session, make_tenant, DocumentStatus.CHUNKING)
    result = await _run(db_session, doc, tenant_id, job_try=1)
    assert result["status"] == "skipped"
    assert db_session.get(DocumentModel, doc.id).status == "chunking"


class _AssertCommittedQueue:
    def __init__(self, session):
        self.session = session
        self.calls = 0

    async def enqueue(self, task_name, **kwargs):
        # The worker reads the status in another transaction: it must be committed.
        assert not self.session.in_transaction(), "enqueued before commit"
        self.calls += 1


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [DocumentStatus.FAILED, DocumentStatus.PENDING])
async def test_retry_commits_then_enqueues(db_session, make_tenant, status):
    doc, tenant_id = _doc(db_session, make_tenant, status)
    queue = _AssertCommittedQueue(db_session)
    service = get_reprocess_document_service(session=db_session, queue=queue)
    with patch("src.core.cache.invalidate_cache", new=AsyncMock()):
        await service.execute_retry(doc.id, tenant_id=tenant_id)
    assert queue.calls == 1
    assert db_session.get(DocumentModel, doc.id).status == "pending"


@pytest.mark.asyncio
async def test_reprocess_commits_reset_and_version_bump(db_session, make_tenant):
    doc, tenant_id = _doc(db_session, make_tenant, DocumentStatus.INDEXED)
    queue = _AssertCommittedQueue(db_session)
    service = get_reprocess_document_service(session=db_session, queue=queue)
    with patch("src.core.cache.invalidate_cache", new=AsyncMock()):
        await service.execute_reprocess(doc.id, tenant_id=tenant_id)
    row = db_session.get(DocumentModel, doc.id)
    assert (row.status, row.version, queue.calls) == ("pending", 2, 1)


@pytest.mark.asyncio
async def test_search_cache_key_follows_tenant_data_version():
    from src.retrieval.application.query.hybrid_search import HybridSearchService

    svc = HybridSearchService(
        query_embed_service=AsyncMock(), vector_repo=AsyncMock(), fts_repo=AsyncMock()
    )
    seen: list[str] = []

    async def _hit(key):
        seen.append(key)
        return []

    tenant = uuid.uuid4()
    with patch.object(HybridSearchService, "_cache_get", staticmethod(_hit)), \
         patch("src.core.cache.get_search_version", new=AsyncMock(side_effect=[3, 4])):
        await svc.search(tenant, "q")
        await svc.search(tenant, "q")
    assert seen[0].startswith(f"search:{tenant}:v3:") and seen[1].startswith(f"search:{tenant}:v4:")
