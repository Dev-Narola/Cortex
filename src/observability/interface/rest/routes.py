"""
Health check endpoints for observability.
"""

import inspect

import redis.asyncio as redis
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.platform.database import get_db
from src.platform.redis_client import get_redis

router = APIRouter(tags=["health"])


@router.get("/health/live")
async def liveness_probe():
    """
    Liveness probe - checks if the application is running.
    Returns 200 OK if the application is running, regardless of dependencies.
    """
    return {"status": "ok"}


@router.get("/health/ready")
async def readiness_probe(
    db: Session = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis),
):
    """
    Readiness probe - checks if the application is ready to serve requests.
    Verifies database and Redis connectivity.
    Returns 200 OK if both dependencies are healthy, 503 otherwise.
    """
    db_status = "error"
    redis_status = "error"
    try:
        db_result = db.execute(text("SELECT 1"))
        if inspect.isawaitable(db_result):
            await db_result
        db_status = "ok"
    except Exception:
        db_status = "error"

    try:
        await redis_client.ping()
        redis_status = "ok"
    except Exception:
        redis_status = "error"

    if db_status == "ok" and redis_status == "ok":
        return {
            "status": "ok",
            "checks": {
                "database": db_status,
                "redis": redis_status,
            },
        }

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail={
            "status": "error",
            "checks": {
                "database": db_status,
                "redis": redis_status,
            },
        },
    )


@router.get("/health")
async def health_check(
    db: Session = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis),
):
    """
    Health check - returns overall application health including dependencies.
    Equivalent to readiness check.
    """
    return await readiness_probe(db, redis_client)
