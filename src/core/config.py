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

V5 additions: production deployment knobs — CORS, trusted hosts,
SQLAlchemy connection pool, Gunicorn/Uvicorn worker counts, AWS
region, ALB support, and ``SecretsManager`` toggles. Defaults are
chosen so a freshly built container with the right env vars
populated starts cleanly in production; nothing here is a hidden
opinion.
"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # ------------------------------------------------------------------
    # Core runtime
    # ------------------------------------------------------------------
    DATABASE_URL: str = "postgresql+psycopg://postgres:postgres@localhost:5432/app"
    # The individual Postgres credential fields. In production
    # they are fetched from AWS Secrets Manager and combined
    # with ``POSTGRES_HOST`` / ``POSTGRES_PORT`` / ``POSTGRES_DB``
    # to render ``DATABASE_URL`` if it is not provided directly.
    # When ``DATABASE_URL`` is set, the individual fields are
    # ignored. This split is the standard pattern for keeping
    # secret material out of the connection string in env files
    # and in CI logs.
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "app"
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

    # ------------------------------------------------------------------
    # V5 — Production deployment
    # ------------------------------------------------------------------
    # Comma-separated list of origins allowed by CORS. ``*`` is
    # supported for the dev convenience case, but production should
    # pass a real list (e.g. ``https://cortex.example.com``). When
    # ``ALLOWED_ORIGINS`` is empty, the ``*`` default is used.
    CORS_ALLOWED_ORIGINS: str = "*"
    CORS_ALLOW_CREDENTIALS: bool = True
    CORS_ALLOW_METHODS: str = "*"
    CORS_ALLOW_HEADERS: str = "*"

    # Comma-separated list of trusted Host headers. ``*`` permits
    # any host (matches the V0 dev convenience); production must
    # restrict this to the real public hostname(s). ``main.py``
    # consumes this list at startup.
    TRUSTED_HOSTS: str = "*"

    # SQLAlchemy connection pool sizing. The async engine shares
    # one pool across all in-flight requests. ``pool_size`` is
    # the number of connections held open; ``max_overflow`` is
    # how many additional connections can open under burst. With
    # WORKERS=2 and pool_size=10, the database may see up to
    # 2 * (10 + 5) = 30 concurrent connections from the API.
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 5
    DB_POOL_TIMEOUT_SECONDS: int = 30
    DB_POOL_RECYCLE_SECONDS: int = 1800  # 30 min — avoid stale conns

    # Uvicorn/Gunicorn worker process count for the API. Each
    # worker is a single uvicorn process; ``WORKERS=1`` is the
    # dev default. Production should set this to ``(2 * CPU) + 1``
    # per the Gunicorn guidance. The container entrypoint honours
    # this value; the docker-compose service sets a sensible
    # value of 2 for a t3.small EC2 host.
    API_WORKERS: int = 1
    # Worker timeout in seconds. uvicorn kills any worker that
    # does not ping the process master within this window — the
    # safety net for genuine hangs in the request path.
    API_WORKER_TIMEOUT: int = 60

    # Arq worker settings. The ingestion worker reads these in
    # ``ingestion/workers/worker.py``. ``ARQ_MAX_JOBS`` is the
    # per-process concurrency cap; tune down on memory-constrained
    # hosts.
    ARQ_MAX_JOBS: int = 10
    ARQ_JOB_TIMEOUT_SECONDS: int = 300
    ARQ_MAX_TRIES: int = 4
    ARQ_KEEP_RESULT_SECONDS: int = 3600

    # AWS region for any direct AWS SDK call (S3, Secrets Manager,
    # etc.). boto3 resolves this from ``AWS_REGION`` / ``AWS_DEFAULT_REGION``
    # automatically, but reading it from settings keeps the
    # application-level config greppable.
    AWS_REGION: str = "us-east-1"

    # When True, the app will fetch any missing secret from AWS
    # Secrets Manager. ``start.sh`` sets this to ``true`` on the
    # production container; dev containers leave it ``false`` and
    # rely on the in-repo ``.env`` file only.
    SECRETS_MANAGER_ENABLED: bool = False

    # Path on disk (inside the container) where ``start.sh`` writes
    # the rendered secrets. Mounted as a tmpfs in production so the
    # rendered values never reach the container layer.
    SECRETS_RENDER_PATH: str = "/run/secrets/.env"

    # ALB / proxy forwarded-header support. When the app sits behind
    # nginx + ALB, the original client IP and the ``X-Forwarded-Proto``
    # header must be honoured for HTTPS-aware redirects and correct
    # audit logging. Starlette's ``ProxyHeadersMiddleware`` reads
    # this; the trusted-proxy IP/CIDR list is comma-separated.
    BEHIND_PROXY: bool = True
    TRUSTED_PROXY_CIDRS: str = "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"

    # Timezone. Every timestamp in the app is ``timestamptz`` and
    # rendered in UTC, so this only affects log timestamps and
    # any locale-aware code paths (currently none). Set to
    # ``UTC`` in production; the docker-compose service pins it
    # to keep logs consistent.
    TIMEZONE: str = "UTC"

    # Maximum upload size in bytes. Mirrored by the ``client_max_body_size``
    # directive in nginx so the proxy and the app agree on the limit.
    NGINX_MAX_BODY_SIZE: str = "12m"

    # Container image tag for the current deploy. Injected by the
    # CD pipeline (``scripts/deploy.sh``) so the running container
    # can be cross-referenced with a specific build. When empty,
    # the value is read from the ``CORTEX_IMAGE_TAG`` env var
    # which the CD workflow sets explicitly.
    CORTEX_IMAGE_TAG: str = ""

    # ``RUN_DB_MIGRATIONS_ON_START`` controls whether the
    # production entrypoint runs ``alembic upgrade head`` before
    # booting the API / worker. Defaults to True so a fresh
    # deploy is self-bootstrapping; set to False in a strict
    # no-migrations-on-app-start policy.
    RUN_DB_MIGRATIONS_ON_START: bool = True

    # ------------------------------------------------------------------
    # V7 — Knowledge graph (graph-database connection)
    # ------------------------------------------------------------------
    # The V1+V3 doc places the knowledge graph in Postgres
    # (``kg_entities`` and ``kg_relations`` tables), and the
    # V7 implementation keeps that — the ``GraphDatabaseClient``
    # seam in ``infrastructure/graph_database.py`` abstracts
    # the backend so a future V9 hardening can swap in Neo4j
    # without changing the repositories. The settings below
    # are kept in the spec's ``NEO4J_*`` shape for forward
    # compatibility; the current implementation ignores them
    # unless ``GRAPH_BACKEND=neo4j`` is set.
    NEO4J_URL: str = ""
    NEO4J_USERNAME: str = ""
    NEO4J_PASSWORD: str = ""
    # ------------------------------------------------------------------
    # V8 — Model Context Protocol (MCP) Server Configuration
    # ------------------------------------------------------------------
    MCP_ENABLED: bool = True
    MCP_SERVER_NAME: str = "Cortex"
    MCP_SERVER_VERSION: str = "1.0.0"
    MCP_DEFAULT_TRANSPORT: str = "websocket"
    MCP_SESSION_TIMEOUT: int = 1800  # 30 minutes
    MCP_MAX_SESSIONS_PER_TENANT: int = 100
    MCP_MAX_MESSAGE_SIZE: int = 1048576  # 1 MB
    MCP_ENABLE_WEBSOCKET: bool = True
    MCP_ENABLE_HTTP: bool = True
    MCP_ENABLE_STDIO: bool = True


settings = Settings()

