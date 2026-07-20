from .config import settings
from .database import SessionLocal
from .redis_client import get_redis as get_redis_dep


def get_settings():
    """
    Dependency to get application settings.
    """
    return settings


def get_db():
    """
    Dependency to get DB session.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_redis():
    """
    Dependency to get Redis client.
    """
    return get_redis_dep()


def get_current_user():
    """
    Placeholder for getting current user.
    To be implemented in V1.
    """
    return None


def get_current_tenant():
    """
    Placeholder for getting current tenant.
    To be implemented in V1.
    """
    return None
