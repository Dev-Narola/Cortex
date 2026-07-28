"""
Database engine + session factories.

The Cortex platform is async-first (FastAPI + uvicorn + Arq), so
the V3 read-path (RAG answer service, hybrid search, conversation
streaming) needs ``AsyncSession``. Legacy V2 code paths (ingestion
worker, which runs out of band in an Arq process) keep using the
sync session because the worker isn't an event loop.

Two engines, two session factories, two ``get_*_db`` dependencies.
Everything that touches the database goes through one of these.

Note: we *do not* enable ``expire_on_commit`` for either session
factory. SQLAlchemy's default is to expire ORM objects after commit
so that accessing an attribute after commit triggers a fresh SELECT.
That's a footgun in async code, where the post-commit access happens
inside an event-loop callback that is no longer bound to a usable
session. Leaving it off means callers must ``refresh()`` explicitly
when they need post-commit state.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator, Generator
from typing import Any

from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from .config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Sync engine — used by the V2 Arq ingestion worker and the identity
# bounded context (whose repositories were written before the async
# migration). Kept because ripping it out would require touching
# every existing repo + test, which is out of scope for V3.
# ---------------------------------------------------------------------------

_sync_engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=_sync_engine,
    expire_on_commit=False,
)

Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """
    Sync FastAPI dependency that yields a ``Session``.

    Retained for V2 endpoints. New V3 endpoints should depend on
    ``get_async_db`` instead.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_db_connection() -> bool:
    """Return True when the configured database accepts a simple query."""
    try:
        with _sync_engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return True
    except Exception:  # noqa: BLE001
        return False


# ---------------------------------------------------------------------------
# Async engine — V3's primary read/write path.
# ---------------------------------------------------------------------------
#
# The ``DATABASE_URL`` for sync and async differs only in the dialect
# prefix (``postgresql+psycopg://`` vs ``postgresql+psycopg://`` is
# the same; the async driver uses ``postgresql+psycopg_async://`` or
# ``postgresql+asyncpg://``). We derive an async URL from the
# configured DATABASE_URL when possible, otherwise fall back to the
# same URL. The conversion is conservative — if the URL already has
# a known async-capable driver, we leave it alone.
def _derive_async_url(url: str) -> str:
    """Return an async-driver URL derived from ``url``.

    The default ``DATABASE_URL`` in ``config.py`` is
    ``postgresql+psycopg://…``. ``psycopg`` (v3) ships an async
    variant under the same name, so we swap the driver. If the URL
    uses ``postgresql+psycopg2://`` we promote it to
    ``postgresql+psycopg://`` (psycopg3 sync) then to async. Any
    other dialect is returned unchanged.
    """
    if not url:
        return url
    if url.startswith("postgresql+psycopg2://"):
        return "postgresql+psycopg://" + url[len("postgresql+psycopg2://"):]
    if url.startswith("postgresql+psycopg://"):
        return "postgresql+psycopg://" + url[len("postgresql+psycopg://"):]
    if url.startswith("postgresql+asyncpg://"):
        return url
    if url.startswith("postgresql://"):
        # Plain ``postgresql://`` works with psycopg/asyncpg via
        # SQLAlchemy's driver inference. We just leave it.
        return url
    return url


_async_engine = create_async_engine(
    _derive_async_url(settings.DATABASE_URL),
    pool_pre_ping=True,
)
AsyncSessionLocal = async_sessionmaker(
    bind=_async_engine,
    class_=AsyncSession,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)


async def get_async_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Async FastAPI dependency that yields an ``AsyncSession``.

    Use this in any V3 endpoint / service that is itself async. The
    session is closed when the request finishes; transactional
    boundaries (commit / rollback) are the caller's responsibility.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            # ``async with`` already calls ``aclose()`` on the session
            # when the context exits; we don't need to do anything
            # extra here.
            pass


__all__ = [
    "AsyncSessionLocal",
    "Base",
    "SessionLocal",
    "_async_engine",
    "_sync_engine",
    "check_db_connection",
    "engine",  # backwards-compat alias (sync); see below
    "get_async_db",
    "get_db",
]


# ---------------------------------------------------------------------------
# Backwards-compat alias.
# ---------------------------------------------------------------------------
#
# Older modules (and existing tests) import ``engine`` directly from
# ``src.core.database``. Expose the sync engine under that name
# so nothing breaks. New code should reach for ``_async_engine`` or
# the ``AsyncSessionLocal`` factory instead.
engine: Any = _sync_engine
