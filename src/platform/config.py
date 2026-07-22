from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

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

    # --- Object storage (S3 / S3-compatible, e.g. MinIO) ---
    # These are read by the ingestion layer's `S3Storage` adapter.
    # The same `ObjectStorage` interface is used whether the
    # backend is AWS S3 in production or MinIO in local
    # development, so application code never has to branch on
    # `S3_ENDPOINT`.
    #
    # S3_ENDPOINT is optional. When unset, boto3 talks to the
    # real AWS S3 service using S3_REGION. When set (typical for
    # local dev with MinIO or for testing against a custom S3
    # endpoint), boto3 routes all calls there instead. Setting
    # `S3_ENDPOINT` to "http://localhost:9000" is the standard
    # MinIO default.
    S3_ENDPOINT: str | None = None
    S3_REGION: str = "us-east-1"
    S3_BUCKET: str | None = None
    S3_ACCESS_KEY: str | None = None
    S3_SECRET_KEY: str | None = None

    # --- Ingestion specific ---
    MAX_DOCUMENT_SIZE_BYTES: int = 10 * 1024 * 1024  # 10MB default


settings = Settings()
