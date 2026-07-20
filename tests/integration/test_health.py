import pytest
import redis.exceptions as redis_exceptions
from httpx import AsyncClient, Response
from sqlalchemy.exc import SQLAlchemyError


@pytest.mark.asyncio
async def test_live_endpoint(client: AsyncClient):
    """Test the liveness endpoint."""
    response = await client.get("/api/v1/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_ready_endpoint_success(client: AsyncClient, db_mock, redis_mock):
    """Test the readiness endpoint when dependencies are healthy."""
    # Configure mocks to return success
    db_mock.execute.return_value = (
        None  # execute returns None, but we just need it not to raise
    )
    redis_mock.ping.return_value = True

    response = await client.get("/api/v1/health/ready")
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["status"] == "ok"
    assert json_data["checks"]["database"] == "ok"
    assert json_data["checks"]["redis"] == "ok"


@pytest.mark.asyncio
async def test_ready_endpoint_database_failure(
    client: AsyncClient, db_mock, redis_mock
):
    """Test the readiness probe when database fails."""
    # Configure mocks: database fails, redis succeeds
    db_mock.execute.side_effect = SQLAlchemyError("Database error")
    redis_mock.ping.return_value = True

    response: Response = await client.get("/api/v1/health/ready")
    assert response.status_code == 503
    json_data = response.json()
    assert json_data["detail"]["status"] == "error"
    assert json_data["detail"]["checks"]["database"] == "error"
    assert json_data["detail"]["checks"]["redis"] == "ok"


@pytest.mark.asyncio
async def test_ready_endpoint_redis_failure(client: AsyncClient, db_mock, redis_mock):
    """Test the readiness probe when redis fails."""
    # Configure mocks: database succeeds, redis fails
    db_mock.execute.return_value = None
    redis_mock.ping.side_effect = redis_exceptions.ConnectionError("Redis error")

    response: Response = await client.get("/api/v1/health/ready")
    assert response.status_code == 503
    json_data = response.json()
    assert json_data["detail"]["status"] == "error"
    assert json_data["detail"]["checks"]["database"] == "ok"
    assert json_data["detail"]["checks"]["redis"] == "error"


@pytest.mark.asyncio
async def test_health_endpoint(client: AsyncClient, db_mock, redis_mock):
    """Test the health endpoint (alias for readiness)."""
    # Configure mocks to return success
    db_mock.execute.return_value = None
    redis_mock.ping.return_value = True

    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["status"] == "ok"
    assert json_data["checks"]["database"] == "ok"
    assert json_data["checks"]["redis"] == "ok"
