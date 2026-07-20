from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
import redis.asyncio as redis
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.main import app
from src.platform.config import Settings
from src.platform.database import get_db as get_db_dep
from src.platform.redis_client import get_redis as get_redis_dep


@pytest.fixture
def settings():
    """Return a test settings object."""
    return Settings(
        DATABASE_URL="sqlite+aiosqlite:///./test.db",
        REDIS_URL="redis://localhost:6379/1",
        APP_NAME="Test App",
        APP_VERSION="0.1.0",
        APP_DESCRIPTION="Test App Description",
        DEBUG=True,
        ENVIRONMENT="testing",
        HOST="0.0.0.0",
        PORT=8000,
        WORKERS=1,
        API_V1_PREFIX="/api/v1",
        SECRET_KEY="test-secret-key",
        ACCESS_TOKEN_EXPIRE_MINUTES=30,
        OPENAI_API_KEY=None,
        AWS_REGION=None,
        S3_BUCKET=None,
        LOG_FORMAT="",
    )


@pytest.fixture
def db_mock():
    """Create a mock async database session."""
    mock = AsyncMock(spec=AsyncSession)
    # We need to mock the execute method to return a result that can be awaited
    # For the health check, we just need it to not raise an exception.
    mock.execute = AsyncMock()
    return mock


@pytest.fixture
def redis_mock():
    """Create a mock async redis client."""
    mock = AsyncMock(spec=redis.Redis)
    mock.ping = AsyncMock(return_value=True)
    return mock


@pytest_asyncio.fixture
async def client(db_mock, redis_mock):
    """Create an async test client with overridden dependencies."""
    app.dependency_overrides[get_db_dep] = lambda: db_mock
    app.dependency_overrides[get_redis_dep] = lambda: redis_mock

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

    # Clean up
    app.dependency_overrides.clear()
