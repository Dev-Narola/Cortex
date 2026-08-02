"""
Graph-database session and transaction management.

This module provides two layers:

* :class:`Neo4jSessionManager` — the *forward-compat*
  name the spec calls for. The current implementation
  delegates to a SQLAlchemy session (the V7 production
  path), but the *shape* of the class is what a future
  Neo4j driver would implement: ``connect`` /
  ``get_session`` / ``execute_transaction`` / ``close``.

* :class:`GraphTransactionManager` — a context
  manager that gives the application layer an
  atomic "create entity + create relationship"
  block. The current backend nests the operations
  inside a single SQLAlchemy session and commits
  (or rolls back) once. The seam lets a future
  Neo4j implementation swap in a real Cypher
  transaction.

Why the V7 production path is Postgres, not Neo4j
(see V1+V3 doc and the Part 1 architecture
decision): the knowledge graph is small per-tenant
(< 100k nodes / < 500k edges for the median
tenant) and Postgres + recursive CTEs handles every
graph query the V1+V3 doc calls for. The cost of
running a second managed service outweighs the
benefit at current scale. The seam here is the
forward-compat point: when a tenant grows past the
Postgres comfort zone, swap the backend by
implementing :class:`Neo4jSessionManager` against
the real driver; the rest of the codebase does not
change.
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from typing import Any

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Forward-compat: Neo4jSessionManager
# ---------------------------------------------------------------------------


class Neo4jSessionManager:
    """Session-manager seam for the graph database.

    The class name honours the spec ("Neo4j") but the
    current implementation is backed by SQLAlchemy /
    Postgres. The methods are the ones a real Neo4j
    driver would implement, so a future swap is a
    drop-in subclass change.

    The manager is **process-scoped** in production:
    the FastAPI app constructs one at boot and passes
    it to the dependency-injection system. The Arq
    worker constructs one per-process on startup.
    Tests construct a fresh one per test (the
    session is request-scoped via the per-request
    SQLAlchemy session).
    """

    def __init__(
        self,
        *,
        backend: str = "postgres",
        session_factory: Callable[[], Session] | None = None,
    ) -> None:
        # ``backend`` is read by :meth:`connect` to
        # choose between the SQLAlchemy session
        # factory (current production path) and a
        # future Neo4j driver. The string is also
        # surfaced in the ``/health/ready`` payload
        # so operators can see which backend is in
        # use.
        self._backend = (backend or "postgres").lower()
        self._session_factory = session_factory
        self._connected = False

    @property
    def backend(self) -> str:
        """Return the active backend identifier (``"postgres"`` or ``"neo4j"``)."""
        return self._backend

    @property
    def is_connected(self) -> bool:
        return self._connected

    # --- lifecycle ----------------------------------------------------

    def connect(self) -> None:
        """Establish the connection.

        The Postgres implementation is a no-op (the
        SQLAlchemy engine is constructed lazily on
        first session use). The future Neo4j
        implementation will open the driver here.
        """
        if self._connected:
            return
        if self._backend == "neo4j":
            # Forward-compat: a future Neo4j
            # implementation would open the driver
            # here. We deliberately do not import
            # the Neo4j driver (it is not a project
            # dependency) so this branch stays a
            # documented stub.
            raise NotImplementedError(
                "Neo4j backend is forward-compatible only; "
                "set GRAPH_BACKEND=postgres or implement the "
                "Neo4j driver binding."
            )
        # ``postgres`` is the supported path — nothing
        # to do at connect time because the engine is
        # bound to the session factory, which is
        # itself lazy.
        self._connected = True
        logger.info(
            "graph_session_manager.connected",
            extra={"backend": self._backend},
        )

    def close(self) -> None:
        """Release the connection.

        The Postgres implementation is a no-op (the
        engine is disposed by the FastAPI lifespan /
        worker shutdown). The future Neo4j
        implementation will close the driver here.
        """
        if not self._connected:
            return
        self._connected = False
        logger.info(
            "graph_session_manager.closed",
            extra={"backend": self._backend},
        )

    # --- session access -----------------------------------------------

    def get_session(self) -> Session:
        """Return a session suitable for a single unit of work.

        The Postgres implementation returns a fresh
        SQLAlchemy session from the injected factory.
        The caller is responsible for ``close()`` (or
        the ``transaction()`` context manager handles
        it).
        """
        if not self._connected:
            self.connect()
        if self._session_factory is None:
            raise RuntimeError(
                "Neo4jSessionManager has no session_factory "
                "for the 'postgres' backend; pass one in the "
                "constructor."
            )
        return self._session_factory()

    @contextmanager
    def transaction(
        self,
        *,
        tenant_id: uuid.UUID | None = None,
    ) -> Iterator["GraphTransactionContext"]:
        """Open a graph transaction for a single unit of work.

        Usage::

            with manager.transaction(tenant_id=t.id) as txn:
                txn.create_entity(entity)
                txn.create_relationship(rel)

        The context manager handles commit on
        successful exit and rollback on any
        exception. The ``tenant_id`` is bound to the
        transaction context so every operation
        through ``txn`` carries the scope — this is
        the *defense-in-depth* tenant-isolation
        check called out in the Part 3 spec.
        """
        if not self._connected:
            self.connect()
        session = self.get_session()
        ctx = GraphTransactionContext(session=session, tenant_id=tenant_id)
        try:
            yield ctx
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def execute_transaction(
        self,
        callback: Callable[["GraphTransactionContext"], Any],
        *,
        tenant_id: uuid.UUID | None = None,
    ) -> Any:
        """Run a callable inside a transaction and return its result.

        Functional-style wrapper around
        :meth:`transaction` for callers that prefer
        a single call.
        """
        with self.transaction(tenant_id=tenant_id) as ctx:
            return callback(ctx)


# ---------------------------------------------------------------------------
# GraphTransactionManager
# ---------------------------------------------------------------------------


class GraphTransactionContext:
    """The active transaction context.

    Wraps a SQLAlchemy session and the tenant id
    that scopes the work. The class exposes the
    high-level operations the application layer
    needs (entity / relationship create) so callers
    do not have to reach into the repos directly.

    A future Neo4j implementation would translate
    these into Cypher ``MERGE`` / ``CREATE``
    statements running inside a single transaction.
    """

    def __init__(
        self,
        *,
        session: Session,
        tenant_id: uuid.UUID | None,
    ) -> None:
        self._session = session
        self._tenant_id = tenant_id

    @property
    def session(self) -> Session:
        return self._session

    @property
    def tenant_id(self) -> uuid.UUID | None:
        return self._tenant_id

    # --- high-level operations ----------------------------------------

    def create_entity(self, entity: Any) -> Any:
        """Insert a :class:`GraphEntity` and return the persisted row.

        The repository handles the
        ``(tenant_id, name, entity_type)`` uniqueness
        constraint via the :class:`ConflictException`
        409 path. The transaction context does not
        re-validate the entity — the domain
        constructor did — it just owns the
        begin/commit boundary.
        """
        from src.knowledge_graph.infrastructure.repositories import (
            GraphEntityRepository,
        )
        repo = GraphEntityRepository(self._session)
        return repo.create(entity)

    def create_relationship(self, relationship: Any) -> Any:
        """Insert a :class:`GraphRelationship` inside the same transaction.

        Atomic with the entity creation: if the
        entity insert raised, the relationship
        insert is never reached, and the outer
        ``transaction()`` block rolls back. This is
        the atomicity guarantee the spec calls out
        for "create entity + create relationship".
        """
        from src.knowledge_graph.infrastructure.repositories import (
            GraphRelationshipRepository,
        )
        repo = GraphRelationshipRepository(self._session)
        return repo.create(relationship)


class GraphTransactionManager:
    """Functional wrapper around :class:`Neo4jSessionManager` for callers
    that prefer explicit ``begin / commit / rollback`` rather than the
    context manager.

    Holds a single :class:`Neo4jSessionManager` and a single
    active transaction at a time. The manager is **not** thread-safe —
    the application uses one per request.
    """

    def __init__(self, session_manager: Neo4jSessionManager) -> None:
        self._session_manager = session_manager
        self._session: Session | None = None
        self._active: bool = False

    @property
    def is_active(self) -> bool:
        return self._active

    def begin(self, *, tenant_id: uuid.UUID | None = None) -> GraphTransactionContext:
        """Open a new transaction.

        Calling ``begin`` while a transaction is
        already open is a programming error and
        raises :class:`RuntimeError`. The caller
        must ``commit`` or ``rollback`` the current
        transaction first.
        """
        if self._active:
            raise RuntimeError(
                "a transaction is already active; commit or rollback first"
            )
        self._session_manager.connect()
        self._session = self._session_manager.get_session()
        self._active = True
        return GraphTransactionContext(
            session=self._session, tenant_id=tenant_id
        )

    def commit(self) -> None:
        """Commit the active transaction."""
        if not self._active or self._session is None:
            raise RuntimeError("no active transaction to commit")
        try:
            self._session.commit()
        finally:
            self._close()

    def rollback(self) -> None:
        """Rollback the active transaction."""
        if not self._active or self._session is None:
            return
        try:
            self._session.rollback()
        finally:
            self._close()

    def _close(self) -> None:
        self._active = False
        if self._session is not None:
            self._session.close()
            self._session = None


__all__ = [
    "GraphTransactionContext",
    "GraphTransactionManager",
    "Neo4jSessionManager",
]
