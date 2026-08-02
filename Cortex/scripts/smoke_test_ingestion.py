#!/usr/bin/env python
"""
Smoke test for the V2 ingestion pipeline.

Simulates an end-to-end flow without requiring live external services by
mocking storage and Redis. Verifies that the entire pipeline from document
creation through chunking and indexing works correctly.

Usage:
    python scripts/smoke_test_ingestion.py

Exit codes:
    0 — all checks passed
    1 — one or more checks failed
"""

import asyncio
import sys
import uuid
import logging
from contextlib import contextmanager
from unittest.mock import patch, Mock
from datetime import datetime, UTC

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Bootstrap Django-style settings before importing app code.
# ---------------------------------------------------------------------------
import os
os.environ.setdefault("ENVIRONMENT", "test")

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.core.database import Base
from src.ingestion.infrastructure.models import (
    DocumentModel,
    DocumentChunkModel,
    DocumentProcessingAttemptModel,
)
from src.ingestion.infrastructure.repositories import DocumentRepository
from src.ingestion.workers.tasks import ingest_document_task
from src.ingestion.domain.entities import Document, DocumentStatus, SourceType


# ---------------------------------------------------------------------------
# In-memory SQLite engine for isolated smoke runs.
# ---------------------------------------------------------------------------
engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
Base.metadata.create_all(engine)
SessionFactory = sessionmaker(bind=engine)


@contextmanager
def db_session():
    session = SessionFactory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_tenant_id() -> uuid.UUID:
    return uuid.uuid4()


def _make_document(tenant_id: uuid.UUID, user_id: uuid.UUID, mime_type="text/plain") -> Document:
    doc = Document.create(
        tenant_id=tenant_id,
        source_type=SourceType.UPLOAD,
        title=f"Smoke-{uuid.uuid4().hex[:6]}",
        mime_type=mime_type,
        created_by=user_id,
    )
    doc.set_storage_uri(f"s3://smoke-bucket/{doc.id}.txt")
    return doc


def _run_task(session, doc: Document, tenant_id: uuid.UUID, content: bytes = b"Hello world. This is the smoke test."):
    ctx = {"job_try": 1}
    with patch("src.ingestion.workers.tasks.get_db_session", return_value=session), \
         patch("src.ingestion.workers.tasks.get_storage") as mock_get_storage, \
         patch("src.ingestion.workers.tasks.invalidate_cache"):
        mock_storage = Mock()
        mock_storage.download.return_value = content
        mock_get_storage.return_value = mock_storage
        return asyncio.get_event_loop().run_until_complete(
            ingest_document_task(ctx, document_id=str(doc.id), tenant_id=str(tenant_id))
        )


# ---------------------------------------------------------------------------
# Smoke checks
# ---------------------------------------------------------------------------

failures: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        log.info("  ✓  %s", name)
    else:
        log.error("  ✗  %s  %s", name, detail)
        failures.append(name)


# --- Check 1: Basic success path -------------------------------------------

log.info("\n[1/4] Basic success path")
tenant_id = _make_tenant_id()
user_id = _make_tenant_id()

with SessionFactory() as session:
    doc = _make_document(tenant_id, user_id)
    repo = DocumentRepository(session)
    repo.create(doc)
    session.commit()

    result = _run_task(session, doc, tenant_id, b"Sentence one. Sentence two. Sentence three.")
    check("returns status=indexed", result["status"] == "indexed")
    check("returns chunk_count > 0", result.get("chunk_count", 0) > 0)

    updated = repo.get_by_id(doc.id, tenant_id=tenant_id)
    check("document.status == INDEXED", updated.status == DocumentStatus.INDEXED)

    chunks = session.query(DocumentChunkModel).filter_by(document_id=doc.id).all()
    check("chunks persisted to DB", len(chunks) == result["chunk_count"])
    check("all chunks have correct tenant_id", all(c.tenant_id == tenant_id for c in chunks))
    check("chunk indices are unique", len({c.chunk_index for c in chunks}) == len(chunks))

    attempts = session.query(DocumentProcessingAttemptModel).filter_by(document_id=doc.id).all()
    check("processing attempt recorded", len(attempts) == 1)
    check("attempt status == succeeded", attempts[0].status == "succeeded")


# --- Check 2: Idempotency ---------------------------------------------------

log.info("\n[2/4] Idempotency — reprocessing replaces chunks")

with SessionFactory() as session:
    doc = _make_document(tenant_id, user_id)
    repo = DocumentRepository(session)
    repo.create(doc)
    session.commit()

    _run_task(session, doc, tenant_id, b"First run. Content here.")
    run1_ids = {
        c.id for c in session.query(DocumentChunkModel).filter_by(document_id=doc.id).all()
    }

    # Reset to pending and reprocess
    repo.update_status(doc.id, tenant_id=tenant_id, status=DocumentStatus.PENDING)
    session.commit()

    _run_task(session, doc, tenant_id, b"Second run. Different content. More words here.")
    run2_ids = {
        c.id for c in session.query(DocumentChunkModel).filter_by(document_id=doc.id).all()
    }

    check("second run produces chunks", len(run2_ids) > 0)
    check("old chunks replaced (disjoint ids)", run1_ids.isdisjoint(run2_ids))


# --- Check 3: Failure path --------------------------------------------------

log.info("\n[3/4] Failure path — parser error marks document as failed")

with SessionFactory() as session:
    doc = _make_document(tenant_id, user_id)
    repo = DocumentRepository(session)
    repo.create(doc)
    session.commit()

    ctx = {"job_try": 1}
    with patch("src.ingestion.workers.tasks.get_db_session", return_value=session), \
         patch("src.ingestion.workers.tasks.get_storage") as mock_get_storage, \
         patch("src.ingestion.workers.tasks.parser_registry") as mock_registry, \
         patch("src.ingestion.workers.tasks.invalidate_cache"):
        mock_storage = Mock()
        mock_storage.download.return_value = b"data"
        mock_get_storage.return_value = mock_storage

        mock_parser = Mock()
        mock_parser.parse.side_effect = Exception("Simulated parser crash")
        mock_registry.get.return_value = mock_parser

        result = asyncio.get_event_loop().run_until_complete(
            ingest_document_task(ctx, document_id=str(doc.id), tenant_id=str(tenant_id))
        )

    check("failure returns status=failed", result["status"] == "failed")

    updated = repo.get_by_id(doc.id, tenant_id=tenant_id)
    check("document.status == FAILED", updated.status == DocumentStatus.FAILED)

    row = session.get(DocumentModel, doc.id)
    check("last_error populated", row.last_error is not None and len(row.last_error) > 0)

    attempt = session.query(DocumentProcessingAttemptModel).filter_by(document_id=doc.id).first()
    check("attempt recorded as failed", attempt is not None and attempt.status == "failed")


# --- Check 4: Tenant isolation ----------------------------------------------

log.info("\n[4/4] Tenant isolation — cross-tenant worker call rejected")

other_tenant_id = _make_tenant_id()

with SessionFactory() as session:
    doc = _make_document(tenant_id, user_id)
    repo = DocumentRepository(session)
    repo.create(doc)
    session.commit()

    # Legitimate run
    _run_task(session, doc, tenant_id, b"Legitimate content.")
    original_chunks = session.query(DocumentChunkModel).filter_by(document_id=doc.id).all()

    # Cross-tenant attempt
    result = _run_task(session, doc, other_tenant_id)
    check(
        "cross-tenant call rejected (not_found or failed)",
        result["status"] in ("not_found", "failed"),
    )

    after_chunks = session.query(DocumentChunkModel).filter_by(document_id=doc.id).all()
    check("original chunks not removed", len(after_chunks) == len(original_chunks))
    check("all chunks still belong to original tenant", all(c.tenant_id == tenant_id for c in after_chunks))


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

log.info("\n" + "=" * 50)
if failures:
    log.error("SMOKE TEST FAILED — %d check(s) did not pass:", len(failures))
    for f in failures:
        log.error("  • %s", f)
    sys.exit(1)
else:
    log.info("SMOKE TEST PASSED — all checks green ✓")
    sys.exit(0)
