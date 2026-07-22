"""
Ingestion pipeline task — V2.

The task receives only (document_id, tenant_id) — never the file bytes.

Pipeline:
    pending → parsing → chunking → indexed
                ↓           ↓           ↓
              failed      failed     (done)

Idempotency:
    Chunks are replaced atomically (delete-then-insert) so retrying a
    partially-completed job never produces duplicate chunks.

Retry:
    TransientWorkerErrors are re-raised so Arq retries with backoff.
    PermanentWorkerErrors write a failed status and return immediately.
"""

from __future__ import annotations

import logging
import math
import random
import uuid
from datetime import UTC, datetime

from src.ingestion.application.chunking import ChunkingConfig
from src.ingestion.domain.entities import Chunk, DocumentStatus
from src.ingestion.workers.dependencies import (
    ChunkRepository,
    DocumentRepository,
    ProcessingAttemptRepository,
    get_chunker,
    get_db_session,
    get_storage,
    parser_registry,
)
from src.ingestion.workers.errors import (
    ChunkingError,
    ParserError,
    PermanentWorkerError,
    StorageError,
    TransientWorkerError,
)
from src.platform.cache import invalidate_cache

logger = logging.getLogger(__name__)

# Default chunking config for V2.
_DEFAULT_CHUNKING_CONFIG = ChunkingConfig(
    strategy="structure_aware",
    chunk_size=1000,
    overlap=150,
)

# Retry backoff parameters
_BACKOFF_BASE_SECONDS: float = 5.0
_BACKOFF_MAX_SECONDS: float = 300.0  # 5 minutes cap


def _backoff_seconds(attempt: int) -> float:
    """Exponential backoff with jitter: base * 2^attempt ± 10%."""
    delay = _BACKOFF_BASE_SECONDS * (2 ** attempt)
    delay = min(delay, _BACKOFF_MAX_SECONDS)
    jitter = delay * 0.1 * random.uniform(-1, 1)
    return max(1.0, delay + jitter)


async def ingest_document_task(
    ctx: dict,
    *,
    document_id: str,
    tenant_id: str,
) -> dict:
    """
    Arq background task: parse, chunk, and persist a document.

    Args:
        ctx:         Arq worker context (includes ``job_try`` for retry count).
        document_id: String-serialised UUID of the document to process.
        tenant_id:   String-serialised UUID of the owning tenant.

    Returns:
        A dict with the final status and chunk count.

    Raises:
        TransientWorkerError: re-raised so Arq schedules a retry with backoff.
    """
    doc_id = uuid.UUID(document_id)
    ten_id = uuid.UUID(tenant_id)
    attempt_number: int = ctx.get("job_try", 1)

    session = get_db_session()
    attempt_id: uuid.UUID | None = None

    try:
        doc_repo = DocumentRepository(session)
        chunk_repo = ChunkRepository(session)
        attempt_repo = ProcessingAttemptRepository(session)

        # ------------------------------------------------------------------
        # 1. Load document and validate it can be processed
        # ------------------------------------------------------------------
        document = doc_repo.get_by_id(doc_id, tenant_id=ten_id)
        if document is None:
            logger.error("Document %s not found for tenant %s", doc_id, ten_id)
            return {"status": "not_found", "document_id": document_id}

        if document.status not in (DocumentStatus.PENDING, DocumentStatus.FAILED):
            logger.warning(
                "Document %s is already in status %s; skipping.",
                doc_id,
                document.status,
            )
            return {"status": "skipped", "reason": str(document.status)}

        if not document.storage_uri:
            _mark_failed_permanent(
                doc_repo=doc_repo,
                session=session,
                doc_id=doc_id,
                ten_id=ten_id,
                error_message="Document has no storage_uri.",
            )
            return {"status": "failed", "reason": "no_storage_uri"}

        # ------------------------------------------------------------------
        # 2. Open attempt record
        # ------------------------------------------------------------------
        attempt_id = attempt_repo.start(
            doc_id, tenant_id=ten_id, attempt_number=attempt_number
        )
        session.commit()

        # ------------------------------------------------------------------
        # 3. Mark PARSING
        # ------------------------------------------------------------------
        doc_repo.update_status(doc_id, tenant_id=ten_id, status=DocumentStatus.PARSING)
        session.commit()
        await invalidate_cache(f"doc_status:{doc_id}")
        logger.info("Document %s → parsing (attempt %d)", doc_id, attempt_number)

        # ------------------------------------------------------------------
        # 4. Download raw bytes from storage
        # ------------------------------------------------------------------
        try:
            storage = get_storage()
            file_bytes = storage.download(document.storage_uri)
        except Exception as exc:
            raise StorageError(
                f"Failed to download {document.storage_uri!r}: {exc}", original=exc
            ) from exc

        # ------------------------------------------------------------------
        # 5. Parse
        # ------------------------------------------------------------------
        try:
            parser = parser_registry.get(document.mime_type)
            parsed = parser.parse(doc_id, file_bytes, document.mime_type)
        except ValueError as exc:
            # Unknown MIME type — permanent failure
            raise ParserError(
                f"No parser for MIME type {document.mime_type!r}: {exc}", original=exc
            ) from exc
        except Exception as exc:
            raise ParserError(
                f"Failed to parse document {doc_id}: {exc}", original=exc
            ) from exc

        # ------------------------------------------------------------------
        # 6. Mark CHUNKING
        # ------------------------------------------------------------------
        doc_repo.update_status(doc_id, tenant_id=ten_id, status=DocumentStatus.CHUNKING)
        session.commit()
        await invalidate_cache(f"doc_status:{doc_id}")
        logger.info("Document %s → chunking", doc_id)

        # ------------------------------------------------------------------
        # 7. Chunk
        # ------------------------------------------------------------------
        try:
            config = _DEFAULT_CHUNKING_CONFIG
            chunker = get_chunker(config)
            raw_chunks = chunker.chunk(
                parsed.text,
                config,
                initial_metadata={
                    **parsed.metadata,
                    "source": str(document.storage_uri),
                    "document_version": document.version,
                },
            )
        except Exception as exc:
            raise ChunkingError(
                f"Failed to chunk document {doc_id}: {exc}", original=exc
            ) from exc

        # ------------------------------------------------------------------
        # 8. Persist chunks (delete-then-insert for idempotency)
        # ------------------------------------------------------------------
        now = datetime.now(UTC)
        domain_chunks = [
            Chunk(
                document_id=doc_id,
                tenant_id=ten_id,
                content=raw["content"],
                chunk_index=idx,
                token_count=raw["token_count"],
                metadata=raw["metadata"],
                created_at=now,
            )
            for idx, raw in enumerate(raw_chunks)
        ]

        inserted = chunk_repo.replace_all(
            domain_chunks, document_id=doc_id, tenant_id=ten_id
        )
        logger.info("Document %s: persisted %d chunks", doc_id, inserted)

        # ------------------------------------------------------------------
        # 9. Mark INDEXED and close attempt
        # ------------------------------------------------------------------
        doc_repo.update_status(doc_id, tenant_id=ten_id, status=DocumentStatus.INDEXED)
        attempt_repo.succeed(attempt_id)
        session.commit()
        await invalidate_cache(f"doc_status:{doc_id}")
        logger.info("Document %s → indexed ✓", doc_id)

        return {
            "status": "indexed",
            "document_id": document_id,
            "chunk_count": inserted,
        }

    except PermanentWorkerError as exc:
        session.rollback()
        logger.error("Permanent failure for document %s: %s", doc_id, exc)
        _mark_failed_permanent(
            doc_repo=doc_repo,
            session=session,
            doc_id=doc_id,
            ten_id=ten_id,
            error_message=str(exc),
        )
        if attempt_id:
            attempt_repo.fail(
                attempt_id,
                error_code=exc.error_code,
                error_message=str(exc),
            )
            session.commit()
        await invalidate_cache(f"doc_status:{doc_id}")
        return {"status": "failed", "reason": exc.error_code, "message": str(exc)}

    except TransientWorkerError as exc:
        session.rollback()
        backoff = _backoff_seconds(attempt_number)
        logger.warning(
            "Transient failure for document %s (attempt %d), retrying in %.1fs: %s",
            doc_id,
            attempt_number,
            backoff,
            exc,
        )
        try:
            doc_repo.update_status(doc_id, tenant_id=ten_id, status=DocumentStatus.FAILED)
            if attempt_id:
                attempt_repo.fail(
                    attempt_id,
                    error_code=exc.error_code,
                    error_message=str(exc),
                )
            session.commit()
            await invalidate_cache(f"doc_status:{doc_id}")
        except Exception:
            logger.exception("Failed to record transient failure for document %s", doc_id)

        # Re-raise so Arq schedules the next retry
        raise

    except Exception as exc:
        session.rollback()
        logger.exception("Unexpected error processing document %s: %s", doc_id, exc)
        try:
            _mark_failed_permanent(
                doc_repo=doc_repo,
                session=session,
                doc_id=doc_id,
                ten_id=ten_id,
                error_message=f"Unexpected error: {exc}",
            )
            if attempt_id:
                attempt_repo.fail(
                    attempt_id,
                    error_code="UNEXPECTED_ERROR",
                    error_message=str(exc)[:1024],
                )
            session.commit()
            await invalidate_cache(f"doc_status:{doc_id}")
        except Exception:
            logger.exception("Failed to mark document %s as failed", doc_id)
        return {"status": "failed", "reason": "unexpected_error"}

    finally:
        session.close()


def _mark_failed_permanent(
    *,
    doc_repo: DocumentRepository,
    session,
    doc_id: uuid.UUID,
    ten_id: uuid.UUID,
    error_message: str,
) -> None:
    """Update status to FAILED and stamp last_error, then commit."""
    from sqlalchemy import update

    from src.ingestion.infrastructure.models import DocumentModel

    doc_repo.update_status(doc_id, tenant_id=ten_id, status=DocumentStatus.FAILED)

    session.execute(
        update(DocumentModel)
        .where(DocumentModel.id == doc_id)
        .where(DocumentModel.tenant_id == ten_id)
        .values(
            last_error=error_message[:1024],
            retry_count=DocumentModel.retry_count + 1,
        )
    )
    session.flush()
