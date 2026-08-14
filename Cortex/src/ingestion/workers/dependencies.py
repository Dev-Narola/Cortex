"""
Worker dependencies — factories for all objects the ingest task needs.

These are module-level functions (not FastAPI Depends) because Arq
workers run outside the FastAPI request/response cycle. Each function
reads from platform settings and produces ready-to-use instances.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from src.ingestion.application.chunking import (
    ChunkingConfig,
    FixedSizeChunker,
    SentenceChunker,
    StructureAwareChunker,
)
from src.ingestion.infrastructure.attempt_repository import ProcessingAttemptRepository
from src.ingestion.infrastructure.chunk_repository import ChunkRepository
from src.ingestion.infrastructure.parser_registry import parser_registry
from src.ingestion.infrastructure.repositories import DocumentRepository
from src.ingestion.infrastructure.s3_storage import S3Storage
from src.core.config import settings

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------


def make_session_factory() -> sessionmaker:
    engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)


_session_factory: sessionmaker | None = None


def get_db_session() -> Session:
    global _session_factory
    if _session_factory is None:
        _session_factory = make_session_factory()
    return _session_factory()


# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------


def get_storage() -> S3Storage:
    return S3Storage(
        bucket=settings.S3_BUCKET or "cortex-documents-dev-2026",
        endpoint_url=settings.S3_ENDPOINT,
        region_name=settings.S3_REGION,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
    )


# ---------------------------------------------------------------------------
# Chunker resolution
# ---------------------------------------------------------------------------

_CHUNKER_MAP = {
    "fixed_size": FixedSizeChunker,
    "sentence": SentenceChunker,
    "structure_aware": StructureAwareChunker,
}


def get_chunker(config: ChunkingConfig):
    cls = _CHUNKER_MAP.get(config.strategy)
    if cls is None:
        raise ValueError(f"Unknown chunking strategy: {config.strategy!r}")
    return cls()


# ---------------------------------------------------------------------------
# Embedding resolution
# ---------------------------------------------------------------------------

def get_embedding_provider():
    """
    Resolve the configured embedding provider.

    Centralised here (not in the application service) so the same
    provider is reused across every worker invocation, and so the
    worker code never imports from ``src.embedding.infrastructure``
    directly.

    Supported values for ``EMBEDDING_PROVIDER``:
      - ``openai``  — OpenAI ``text-embedding-3-*`` models (default)
      - ``nvidia``  — NVIDIA NIM endpoint (OpenAI-compatible surface).
                      Uses ``NVIDIA_API_KEY`` and ``NVIDIA_BASE_URL``
                      from settings. The model defaults to
                      ``nvidia/nv-embedqa-e5-v5`` (1024 dims).
    """
    from src.embedding.infrastructure.providers.openai import (
        OpenAIEmbeddingProvider,
    )

    provider = (settings.EMBEDDING_PROVIDER or "openai").lower()

    if provider == "openai":
        return OpenAIEmbeddingProvider()

    if provider == "nvidia":
        if not settings.NVIDIA_API_KEY:
            raise ValueError(
                "EMBEDDING_PROVIDER=nvidia requires NVIDIA_API_KEY to be set."
            )
        return OpenAIEmbeddingProvider(
            api_key=settings.NVIDIA_API_KEY,
            base_url=settings.NVIDIA_BASE_URL,
            model=settings.NVIDIA_EMBEDDING_MODEL,
            dimensions=settings.NVIDIA_EMBEDDING_DIMENSIONS,
            # NVIDIA NIM does not accept the ``dimensions`` kwarg; pass
            # False so we skip it in the API call. The returned vector
            # length is still validated against ``dimensions``.
            supports_dimensions=False,
        )

    raise ValueError(
        f"Unknown embedding provider: {settings.EMBEDDING_PROVIDER!r}. "
        f"Supported: 'openai', 'nvidia'."
    )

# ---------------------------------------------------------------------------
# Convenience re-exports used by tasks.py
# ---------------------------------------------------------------------------

__all__ = [
    "get_db_session",
    "get_chunker",
    "get_storage",
    "parser_registry",
    "ChunkRepository",
    "DocumentRepository",
    "ProcessingAttemptRepository",
    "ChunkingConfig",
    "get_embedding_provider",
]
