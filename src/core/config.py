"""
Centralised configuration for the Cortex platform.

This is the *only* place that reads from the environment / ``.env``
file. Every other module imports ``settings`` from here so that:

* the configuration surface is greppable from one file;
* tests can construct a fresh ``Settings()`` (see ``tests/conftest.py``)
  with whatever overrides they need;
* swapping out secrets stores (AWS Secrets Manager, Vault, …) is a
  change to one module.

V3 additions: HNSW parameters, LLM model + temperature, reranker
configuration, embedding cache TTL, and tenant search version knobs.
"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # ------------------------------------------------------------------
    # Core runtime
    # ------------------------------------------------------------------
    DATABASE_URL: str = "postgresql+psycopg://postgres:postgres@localhost:5432/app"
    REDIS_URL: str = "redis://localhost:6379/0"
    APP_NAME: str = "Cortex"
    APP_VERSION: str = "0.1.0"
    APP_DESCRIPTION: str = "Multi-tenant AI Knowledge and Agent Platform"
    DEBUG: bool = False
    ENVIRONMENT: str = "development"
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    WORKERS: int = 1
    API_V1_PREFIX: str = "/api/v1"
    SECRET_KEY: str = "change-me-in-development"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    PASSWORD_BCRYPT_ROUNDS: int = 12
    API_KEY_BCRYPT_ROUNDS: int = 10
    OPENAI_API_KEY: str | None = None
    LOG_FORMAT: str = ""

    # ------------------------------------------------------------------
    # Object storage (S3 / S3-compatible, e.g. MinIO)
    # ------------------------------------------------------------------
    S3_ENDPOINT: str | None = None
    S3_REGION: str = "us-east-1"
    S3_BUCKET: str | None = None
    S3_ACCESS_KEY: str | None = None
    S3_SECRET_KEY: str | None = None

    # ------------------------------------------------------------------
    # Ingestion
    # ------------------------------------------------------------------
    MAX_DOCUMENT_SIZE_BYTES: int = 10 * 1024 * 1024  # 10MB default

    # ------------------------------------------------------------------
    # Embedding provider
    # ------------------------------------------------------------------
    # ``EMBEDDING_PROVIDER`` selects which adapter to instantiate. The
    # only provider wired in V3 is OpenAI; adding Voyage / Cohere /
    # local is a new adapter + a new branch in
    # ``ingestion/workers/dependencies.get_embedding_provider``.
    EMBEDDING_PROVIDER: str = "openai"
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    # MUST match the model's actual output dimension. A mismatch will
    # be caught at embed time and rejected as a permanent error.
    EMBEDDING_DIMENSIONS: int = 1536
    EMBEDDING_BATCH_SIZE: int = 100
    EMBEDDING_TIMEOUT: float = 30.0
    EMBEDDING_MAX_RETRIES: int = 3
    EMBEDDING_CACHE_TTL_SECONDS: int = 60 * 60 * 24 * 7  # 7 days

    # ------------------------------------------------------------------
    # LLM provider (used for answer generation + summarization)
    # ------------------------------------------------------------------
    LLM_PROVIDER: str = "openai"
    LLM_MODEL: str = "gpt-4o-mini"
    LLM_TEMPERATURE: float = 0.2
    LLM_TIMEOUT: float = 60.0
    LLM_MAX_TOKENS: int = 1024
    # Hard ceiling on the model's input window. Cortex reserves part
    # of this for system prompt, retrieved sources, and the upcoming
    # assistant response — see ContextWindowManager for the actual
    # budgeting math.
    LLM_CONTEXT_WINDOW_TOKENS: int = 128_000
    LLM_RESERVATION_TOKENS: int = 4_000

    # ------------------------------------------------------------------
    # Reranker
    # ------------------------------------------------------------------
    # V3 ships an ``IdentityReranker`` (a no-op that just preserves
    # the fused order) — real cross-encoder support lands in V4+ once
    # we have a concrete hosted provider to integrate. The config
    # surface is in place so a swap is a one-line change.
    RERANKER_PROVIDER: str = "identity"
    RERANKER_TIMEOUT: float = 15.0
    RERANKER_MAX_RETRIES: int = 2

    # ------------------------------------------------------------------
    # Hybrid search parameters
    # ------------------------------------------------------------------
    # ``vector_top_k`` and ``keyword_top_k`` are the *candidate* pool
    # sizes pulled from each retriever before fusion. ``fusion_top_k``
    # trims the fused list. ``rerank_top_k`` is the slice of fused
    # candidates passed to the (optional) reranker. ``final_top_k`` is
    # what the API returns to the caller. The defaults match the V3
    # spec: 50 → 30 → 20 → 5.
    VECTOR_TOP_K: int = 50
    KEYWORD_TOP_K: int = 50
    FUSION_TOP_K: int = 30
    RERANK_TOP_K: int = 20
    FINAL_TOP_K: int = 5
    # RRF smoothing constant. The classic paper uses 60; lower values
    # push fusion toward top-1, higher values flatten it.
    RRF_K: int = 60

    # ------------------------------------------------------------------
    # HNSW index parameters (pgvector)
    # ------------------------------------------------------------------
    # These map to ``USING hnsw (embedding vector_cosine_ops) WITH (...)``.
    # Higher ``m`` and ``ef_construction`` = better recall, more memory,
    # slower indexing. The defaults are pgvector's recommended starting
    # point; tune once we have real production data volumes.
    HNSW_M: int = 16
    HNSW_EF_CONSTRUCTION: int = 64
    # ``ef_search`` is a runtime parameter set per-query (not a
    # CREATE-INDEX option); the search repository reads it from here.
    HNSW_EF_SEARCH: int = 40

    # ------------------------------------------------------------------
    # Caching
    # ------------------------------------------------------------------
    # ``SEARCH_RESULT_CACHE_TTL`` is the TTL on per-tenant, per-query
    # result cache entries. The cache is additionally versioned by
    # ``tenant_search_version`` so any data-changing event (upload,
    # delete, reindex) invalidates the whole tenant's cache namespace
    # without us having to walk keys.
    SEARCH_RESULT_CACHE_TTL_SECONDS: int = 60 * 5  # 5 minutes


settings = Settings()
