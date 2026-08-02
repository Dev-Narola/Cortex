from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import AsyncMock

# Make `src.*` importable when pytest is invoked from a directory
# that doesn't already have `src/` on PYTHONPATH (e.g. CI runners
# that don't read pyproject.toml's [tool.pytest.ini_options]
# pythonpath setting before conftest.py is loaded). We resolve the
# path relative to THIS file so the same code works whether the
# project is checked out at the repo root or one level deeper.
_SRC_PARENT = Path(__file__).resolve().parent.parent / "src"
if str(_SRC_PARENT.parent) not in sys.path:
    sys.path.insert(0, str(_SRC_PARENT.parent))

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
import redis.asyncio as redis  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402

from src.main import app  # noqa: E402
from src.core.config import Settings  # noqa: E402
from src.core.database import get_db as get_db_dep  # noqa: E402
from src.core.redis_client import get_redis as get_redis_dep  # noqa: E402


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
