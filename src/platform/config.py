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
    AWS_REGION: str | None = None
    S3_BUCKET: str | None = None
    LOG_FORMAT: str = ""


settings = Settings()
