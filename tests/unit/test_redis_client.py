"""
Unit tests for Redis client.
"""

from unittest.mock import AsyncMock, patch

import pytest

from src.platform.redis_client import (
    close_redis,
    get_redis,
    get_redis_client,
    init_redis,
    ping,
)


@pytest.mark.asyncio
async def test_init_redis():
    """Test Redis initialization."""
    with (
        patch("src.platform.redis_client.get_redis_url") as mock_get_url,
        patch(
            "src.platform.redis_client.ConnectionPool.from_url"
        ) as mock_pool_from_url,
        patch("src.platform.redis_client.redis.Redis") as mock_redis_class,
    ):

        # Setup mocks
        mock_get_url.return_value = "redis://localhost:6379"
        mock_pool = AsyncMock()
        mock_pool_from_url.return_value = mock_pool
        mock_redis_instance = AsyncMock()
        mock_redis_class.return_value = mock_redis_instance
        mock_redis_instance.ping.return_value = True

        # Call the function
        await init_redis()

        # Assertions
        mock_get_url.assert_called_once()
        mock_pool_from_url.assert_called_once_with(
            "redis://localhost:6379",
            encoding="utf-8",
            decode_responses=True,
            max_connections=20,
            retry_on_timeout=True,
            health_check_interval=30,
        )
        mock_redis_class.assert_called_once_with(connection_pool=mock_pool)
        mock_redis_instance.ping.assert_called_once()


@pytest.mark.asyncio
async def test_close_redis():
    """Test Redis cleanup."""
    # Setup global state
    import src.platform.redis_client as redis_client

    mock_redis_client = AsyncMock()
    mock_pool = AsyncMock()
    redis_client._redis_client = mock_redis_client
    redis_client._pool = mock_pool

    # Call the function
    await close_redis()

    # Assertions
    mock_redis_client.aclose.assert_called_once()  # Updated to aclose
    mock_pool.disconnect.assert_called_once()
    assert redis_client._redis_client is None
    assert redis_client._pool is None


@pytest.mark.asyncio
async def test_get_redis_not_initialized():
    """Test getting Redis client when not initialized."""
    # Reset global state
    import src.platform.redis_client as redis_client

    redis_client._redis_client = None

    # Test that it raises an error
    with pytest.raises(RuntimeError, match="Redis not initialized"):
        await get_redis()


@pytest.mark.asyncio
async def test_get_redis_initialized():
    """Test getting Redis client when initialized."""
    # Setup global state
    import src.platform.redis_client as redis_client

    mock_redis = AsyncMock()
    redis_client._redis_client = mock_redis

    # Call the function
    result = await get_redis()

    # Assertions
    assert result == mock_redis


@pytest.mark.asyncio
async def test_ping_success():
    """Test successful Redis ping."""
    # Setup global state
    import src.platform.redis_client as redis_client

    mock_redis = AsyncMock()
    mock_redis.ping.return_value = True
    redis_client._redis_client = mock_redis

    # Call the function
    result = await ping()

    # Assertions
    assert result is True
    mock_redis.ping.assert_called_once()


@pytest.mark.asyncio
async def test_ping_failure():
    """Test failed Redis ping."""
    # Setup global state
    import src.platform.redis_client as redis_client

    mock_redis = AsyncMock()
    mock_redis.ping.side_effect = Exception("Connection failed")
    redis_client._redis_client = mock_redis

    # Call the function
    result = await ping()

    # Assertions
    assert result is False
    mock_redis.ping.assert_called_once()


@pytest.mark.asyncio
async def test_ping_not_initialized():
    """Test ping when Redis is not initialized."""
    # Reset global state
    import src.platform.redis_client as redis_client

    redis_client._redis_client = None

    # Call the function
    result = await ping()

    # Assertions
    assert result is False


def test_get_redis_client():
    """Test getting Redis client directly."""
    # Reset global state
    import src.platform.redis_client as redis_client

    redis_client._redis_client = None

    # Test when not initialized
    assert get_redis_client() is None

    # Test when initialized
    mock_redis = object()
    redis_client._redis_client = mock_redis
    assert get_redis_client() is mock_redis
