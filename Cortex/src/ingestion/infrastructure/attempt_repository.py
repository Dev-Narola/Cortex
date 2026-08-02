"""
ProcessingAttemptRepository — persistence for document_processing_attempts.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from src.ingestion.infrastructure.models import DocumentProcessingAttemptModel


class ProcessingAttemptRepository:
    """Write attempt records for operational history and retry tracking."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def start(
        self,
        document_id: uuid.UUID,
        *,
        tenant_id: uuid.UUID,
        attempt_number: int,
    ) -> uuid.UUID:
        """Record the start of a processing attempt. Returns the attempt id."""
        record = DocumentProcessingAttemptModel(
            id=uuid.uuid4(),
            document_id=document_id,
            tenant_id=tenant_id,
            attempt_number=attempt_number,
            status="running",
            started_at=datetime.now(UTC),
        )
        self._session.add(record)
        self._session.flush()
        return record.id

    def succeed(self, attempt_id: uuid.UUID) -> None:
        """Mark an attempt as succeeded."""
        record = self._session.get(DocumentProcessingAttemptModel, attempt_id)
        if record:
            record.status = "succeeded"
            record.finished_at = datetime.now(UTC)
            self._session.flush()

    def fail(
        self,
        attempt_id: uuid.UUID,
        *,
        error_code: str,
        error_message: str,
    ) -> None:
        """Mark an attempt as failed with error details."""
        record = self._session.get(DocumentProcessingAttemptModel, attempt_id)
        if record:
            record.status = "failed"
            record.error_code = error_code
            record.error_message = error_message[:1024]
            record.finished_at = datetime.now(UTC)
            self._session.flush()

    def count_attempts(self, document_id: uuid.UUID) -> int:
        """Return how many attempts have been recorded for a document."""
        from sqlalchemy import func, select

        stmt = select(func.count()).where(
            DocumentProcessingAttemptModel.document_id == document_id
        )
        return self._session.execute(stmt).scalar_one()


__all__ = ["ProcessingAttemptRepository"]
