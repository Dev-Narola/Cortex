"""
Worker error categories.

Every exception the worker can raise is classified as either
transient (worth retrying) or permanent (fail immediately).

The task catches these and uses them to decide whether to re-raise
(letting Arq retry the job) or return a failed result directly.
"""


class WorkerError(Exception):
    """Base class for all ingestion worker errors."""

    error_code: str = "WORKER_ERROR"

    def __init__(self, message: str, *, original: Exception | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.original = original


class TransientWorkerError(WorkerError):
    """
    Temporary failure — safe to retry.

    Examples:
      - S3 connection timeout
      - Database connection lost
      - Redis unavailable
      - Parser dependency temporarily unreachable
    """

    error_code: str = "TRANSIENT_ERROR"


class PermanentWorkerError(WorkerError):
    """
    Unrecoverable failure — do not retry.

    Examples:
      - Unsupported MIME type
      - Corrupt PDF
      - No storage_uri on the document
    """

    error_code: str = "PERMANENT_ERROR"


class StorageError(TransientWorkerError):
    """S3 download or upload failure."""

    error_code: str = "STORAGE_ERROR"


class ParserError(PermanentWorkerError):
    """File could not be parsed (bad format, corrupt bytes, unsupported type)."""

    error_code: str = "PARSER_ERROR"


class ChunkingError(PermanentWorkerError):
    """Chunking failed (unexpected document structure)."""

    error_code: str = "CHUNKING_ERROR"
