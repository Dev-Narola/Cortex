"""
Graph-database client abstraction.

The V7 spec calls for a separate graph database (Neo4j
is the recommendation). The V1+V3 doc and the existing
ingestion schema both place the knowledge graph in
Postgres (``kg_entities`` and ``kg_relations`` tables),
and the V5 trade-off was "no managed services until a
specific pain justifies them."

This module threads the needle: the *interface* is
``GraphDatabaseClient``, an abstract seam that the
repositories depend on. The *current implementation*
is ``PostgresGraphDatabaseClient``, which wraps a
SQLAlchemy session. If a future V9 hardening pushes
us to Neo4j, the new ``Neo4jGraphDatabaseClient``
sits in this module, the repositories are unchanged,
and the spec's ``NEO4J_URL`` / ``NEO4J_USERNAME`` /
``NEO4J_PASSWORD`` settings are wired up.

The interface is intentionally tiny: ``connect``,
``execute``, ``close``. ``execute`` takes a query
identifier (so callers can be tested with a stub)
and a parameter dict, and returns whatever the
backend produced. The repositories translate
high-level operations ("create entity", "traverse
from here") into backend-specific queries against
this seam.

Why a session-scope rather than a process-scope
client? The application already manages SQLAlchemy
sessions per request (see
:mod:`src.core.dependencies`). A graph-database
client that opens a single long-lived connection
would compete with that pattern; a session-scope
client fits the existing request lifecycle.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from sqlalchemy import text
from sqlalchemy.sql import Executable
from sqlalchemy.sql.expression import TextClause


class GraphDatabaseClient(ABC):
    """The single seam between the knowledge-graph context and any graph backend.

    Three methods, deliberately:

    * :meth:`connect` — establish the underlying
      connection. For the Postgres implementation
      this is a no-op (the session is already open);
      for a future Neo4j implementation this opens
      a driver connection.
    * :meth:`execute` — run a named query with a
      parameter dict. The ``query_id`` is a
      backend-specific identifier (e.g. a SQL
      string for the Postgres implementation, a
      Cypher string for a future Neo4j one). The
      return shape is ``list[dict[str, Any]]`` —
      one dict per row, with column-name keys.
    * :meth:`close` — release the underlying
      connection. The Postgres implementation is a
      no-op (the session's lifecycle is managed
      outside); a Neo4j implementation would close
      the driver.
    """

    @abstractmethod
    def connect(self) -> None:
        """Establish the underlying connection."""

    @abstractmethod
    async def execute(
        self,
        query_id: "str | TextClause | Executable",
        parameters: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """Run a named query; return rows as dicts.

        The return shape is the lowest common
        denominator across backends: a list of rows,
        each row a dict keyed by column / property
        name. Higher-level types (graph nodes,
        edges) are constructed from this in the
        repositories.
        """

    @abstractmethod
    def close(self) -> None:
        """Release the underlying connection."""


class PostgresGraphDatabaseClient(GraphDatabaseClient):
    """The Postgres + SQLAlchemy implementation.

    Wraps an existing :class:`sqlalchemy.orm.Session`.
    The session is owned by the request lifecycle
    (see :mod:`src.core.dependencies`); the graph
    client does not close it on ``close`` because
    the application does.

    The ``query_id`` parameter is interpreted as a
    raw SQL string. The repositories pass the SQL
    they want; this client does not maintain a
    query registry. A future optimisation would
    be a prepared-statement cache keyed on
    ``query_id`` — see the V9 hardening list.
    """

    def __init__(self, session: Any) -> None:
        # ``Any`` rather than ``Session`` to avoid a
        # SQLAlchemy import in this module's public
        # surface; the repositories that use this
        # client pass a real Session.
        self._session = session

    def connect(self) -> None:
        # No-op: the session is managed by the
        # request lifecycle.
        return None

    async def execute(
        self,
        query_id: str | TextClause | Executable,
        parameters: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """Run a SQL statement; return rows as dicts.

        The method is ``async`` to match the
        interface so a future Neo4j driver (which
        is naturally async) can be a drop-in
        replacement. The Postgres implementation
        runs the query synchronously inside the
        event loop — fine for the small graph
        queries the V7 spec calls for; a V9
        hardening item is the async SQLAlchemy
        switch.

        ``query_id`` is a SQL string (or a
        pre-built ``TextClause`` / ``Executable``).
        Plain strings are wrapped in
        :func:`sqlalchemy.text` so the statement
        is declared as a textual SQL expression
        and not a Core expression (which is the
        SQLAlchemy 2.x requirement).
        """
        stmt: TextClause | Executable
        if isinstance(query_id, str):
            stmt = text(query_id)
        else:
            stmt = query_id
        result = self._session.execute(
            stmt, parameters or {}
        )
        # ``mappings().all()`` is the canonical
        # SQLAlchemy 2.x way to get back dict-like
        # rows; each row is a ``RowMapping`` which
        # behaves like a dict for the purposes of
        # the rest of the codebase.
        return [dict(row) for row in result.mappings().all()]

    def close(self) -> None:
        # No-op: the session is managed by the
        # request lifecycle.
        return None


class _NoopGraphDatabaseClient(GraphDatabaseClient):
    """An in-memory client for tests.

    Tests that exercise the repositories but do not
    need a real database (e.g. unit tests on the
    domain layer) can use this client. The
    repositories fall back to the SQLAlchemy session
    when this client is wired in; the graph client
    is currently only used for recursive-CTE
    traversals, which the V7 spec lands in a later
    phase.
    """

    def connect(self) -> None:
        return None

    async def execute(
        self,
        query_id: str,
        parameters: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        return []

    def close(self) -> None:
        return None


__all__ = [
    "GraphDatabaseClient",
    "PostgresGraphDatabaseClient",
    "_NoopGraphDatabaseClient",
]
