"""
Integration tests for Redis client.
These tests require a running Redis instance.
"""

import asyncio
import os

import pytest
from redis.exceptions import ConnectionError, RedisError

from src.platform.redis_client import close_redis, get_redis, init_redis, ping


@pytest.mark.integration
@pytest.mark.asyncio
async def test_redis_integration():
    """Test Redis integration with a real Redis instance."""
    # Save original environment variables
    original_redis_host = os.environ.get("REDIS_HOST")
    original_redis_port = os.environ.get("REDIS_PORT")

    try:
        # Set environment variables for Redis connection
        os.environ["REDIS_HOST"] = "localhost"
        os.environ["REDIS_PORT"] = "6379"

        # Initialize Redis
        await init_redis()

        # Test ping
        if not await ping():
            pytest.skip("Redis server not reachable for integration test")

        # Test getting Redis client
        redis_client = await get_redis()
        assert redis_client is not None

        # Test basic operations
        test_key = "test:integration"
        test_value = "test_value"

        await redis_client.set(test_key, test_value)
        value = await redis_client.get(test_key)
        assert value == test_value

        # Test expiration
        await redis_client.expire(test_key, 1)
        # Wait for expiration
        await asyncio.sleep(1.1)
        expired_value = await redis_client.get(test_key)
        assert expired_value is None

        # Clean up
        await redis_client.delete(test_key)

    except ConnectionError:
        pytest.skip("Redis server not available at localhost:6379")
    except RedisError as e:
        # Older Redis servers (e.g. 5.x) don't support the RESP3 HELLO command
        # that the modern redis-py client sends during connection setup.
        pytest.skip(f"Redis server not compatible with client: {e}")
    except Exception as e:
        pytest.fail(f"Unexpected error: {e}")
    finally:
        # Restore original environment variables
        if original_redis_host is not None:
            os.environ["REDIS_HOST"] = original_redis_host
        elif "REDIS_HOST" in os.environ:
            del os.environ["REDIS_HOST"]

        if original_redis_port is not None:
            os.environ["REDIS_PORT"] = original_redis_port
        elif "REDIS_PORT" in os.environ:
            del os.environ["REDIS_PORT"]

        # Clean up
        try:
            await close_redis()
        except Exception:
            pass


@pytest.mark.integration
def test_get_redis_client_sync():
    """Test the synchronous getter for Redis client."""
    from src.platform.redis_client import get_redis_client

    # Should return None when not initialized
    assert get_redis_client() is None
