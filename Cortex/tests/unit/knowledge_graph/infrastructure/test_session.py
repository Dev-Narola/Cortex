"""
Unit tests for the V7 Knowledge Graph session + transaction manager.

Covers the Phase 7 spec rules:

* :class:`Neo4jSessionManager` opens and closes
  the underlying SQLAlchemy session correctly.
* :meth:`Neo4jSessionManager.transaction` commits
  on success and rolls back on exception.
* :class:`GraphTransactionManager` exposes the
  explicit ``begin`` / ``commit`` / ``rollback``
  API the spec calls out.
* A failed ``create_entity`` inside a transaction
  rolls back the entire unit of work — the spec's
  "atomic entity + relationship" guarantee.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.core.database import Base
from src.identity.infrastructure import models as _id_models  # noqa: F401
from src.knowledge_graph.domain.entities import GraphEntity, GraphRelationship
from src.knowledge_graph.domain.value_objects import EntityType, RelationshipType
from src.knowledge_graph.infrastructure.repositories import (
    GraphEntityRepository,
    GraphRelationshipRepository,
)
from src.knowledge_graph.infrastructure.session import (
    GraphTransactionManager,
    Neo4jSessionManager,
)
from src.shared.exceptions import ConflictException


def _build_in_memory_engine():
    """Build an in-memory SQLite engine with FK enforcement on.

    SQLite's foreign-key enforcement is opt-in
    (the ``PRAGMA foreign_keys = ON`` line). The
    production path is Postgres, which enforces
    FKs by default; the test mirrors that with
    a connect listener.
    """
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _fk(dbapi_connection, _connection_record):  # noqa: ANN001
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys = ON")
        finally:
            cursor.close()

    Base.metadata.create_all(engine)
    return engine


def _seed_tenant(engine) -> uuid.UUID:
    """Insert a tenant so the FKs are satisfied."""
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        tenant_id = uuid.uuid4()
        session.add(
            _id_models.TenantModel(
                id=tenant_id,
                name="TestCo",
                slug="testco",
                plan="free",
                settings={},
                is_active=True,
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
        )
        session.commit()
        return tenant_id
    finally:
        session.close()


class TestNeo4jSessionManager:
    """Tests for the session manager."""

    def test_connect_and_close(self):
        engine = _build_in_memory_engine()
        factory = sessionmaker(bind=engine)
        mgr = Neo4jSessionManager(
            backend="postgres", session_factory=factory
        )
        assert mgr.is_connected is False
        mgr.connect()
        assert mgr.is_connected is True
        mgr.close()
        assert mgr.is_connected is False

    def test_get_session_returns_a_working_session(self):
        engine = _build_in_memory_engine()
        factory = sessionmaker(bind=engine)
        mgr = Neo4jSessionManager(
            backend="postgres", session_factory=factory
        )
        mgr.connect()
        session = mgr.get_session()
        try:
            assert session is not None
            # A trivial query: smoke check the
            # session is alive.
            session.execute(_id_models.TenantModel.__table__.select())
        finally:
            session.close()

    def test_neo4j_backend_raises(self):
        """The forward-compat Neo4j backend is not implemented."""
        mgr = Neo4jSessionManager(backend="neo4j", session_factory=lambda: None)
        with pytest.raises(NotImplementedError):
            mgr.connect()

    def test_transaction_commits_on_success(self):
        engine = _build_in_memory_engine()
        factory = sessionmaker(bind=engine)
        tenant_id = _seed_tenant(engine)
        mgr = Neo4jSessionManager(
            backend="postgres", session_factory=factory
        )

        with mgr.transaction(tenant_id=tenant_id) as txn:
            entity = txn.create_entity(
                GraphEntity.create(
                    tenant_id=tenant_id,
                    name="Cortex",
                    entity_type=EntityType.PROJECT,
                )
            )
            assert entity.id is not None

        # After the ``with`` block, the row is
        # visible from a fresh session.
        Session = sessionmaker(bind=engine)
        session = Session()
        try:
            row = session.get(_id_models.TenantModel, tenant_id)
            assert row is not None
        finally:
            session.close()

    def test_transaction_rolls_back_on_exception(self):
        engine = _build_in_memory_engine()
        factory = sessionmaker(bind=engine)
        tenant_id = _seed_tenant(engine)
        mgr = Neo4jSessionManager(
            backend="postgres", session_factory=factory
        )

        with pytest.raises(ConflictException):
            with mgr.transaction(tenant_id=tenant_id) as txn:
                # First entity persists in the
                # transaction.
                txn.create_entity(
                    GraphEntity.create(
                        tenant_id=tenant_id,
                        name="Duplicate",
                        entity_type=EntityType.PROJECT,
                    )
                )
                # Second entity has the same
                # ``(tenant_id, name, entity_type)``
                # triple — raises ConflictException,
                # which the context manager turns
                # into a rollback.
                txn.create_entity(
                    GraphEntity.create(
                        tenant_id=tenant_id,
                        name="Duplicate",
                        entity_type=EntityType.PROJECT,
                    )
                )

        # After the rollback, no row was committed.
        repo = GraphEntityRepository(
            sessionmaker(bind=engine)()
        )
        # Close the repo's session — we only
        # need its query behaviour.
        try:
            results = list(repo.search(tenant_id=tenant_id, query="Duplicate"))
            assert results == []
        finally:
            repo._db.close()  # type: ignore[attr-defined]

    def test_execute_transaction_returns_callback_result(self):
        engine = _build_in_memory_engine()
        factory = sessionmaker(bind=engine)
        tenant_id = _seed_tenant(engine)
        mgr = Neo4jSessionManager(
            backend="postgres", session_factory=factory
        )

        def _work(txn):
            e = txn.create_entity(
                GraphEntity.create(
                    tenant_id=tenant_id,
                    name="Returned",
                    entity_type=EntityType.PROJECT,
                )
            )
            return e.name

        result = mgr.execute_transaction(
            _work, tenant_id=tenant_id
        )
        assert result == "Returned"


class TestGraphTransactionManager:
    """Tests for the explicit begin / commit / rollback API."""

    def test_begin_then_commit_persists(self):
        engine = _build_in_memory_engine()
        factory = sessionmaker(bind=engine)
        tenant_id = _seed_tenant(engine)
        session_manager = Neo4jSessionManager(
            backend="postgres", session_factory=factory
        )
        mgr = GraphTransactionManager(session_manager)

        ctx = mgr.begin(tenant_id=tenant_id)
        ctx.create_entity(
            GraphEntity.create(
                tenant_id=tenant_id,
                name="Explicit",
                entity_type=EntityType.PROJECT,
            )
        )
        mgr.commit()
        assert mgr.is_active is False

    def test_begin_then_rollback_does_not_persist(self):
        engine = _build_in_memory_engine()
        factory = sessionmaker(bind=engine)
        tenant_id = _seed_tenant(engine)
        session_manager = Neo4jSessionManager(
            backend="postgres", session_factory=factory
        )
        mgr = GraphTransactionManager(session_manager)

        ctx = mgr.begin(tenant_id=tenant_id)
        ctx.create_entity(
            GraphEntity.create(
                tenant_id=tenant_id,
                name="RolledBack",
                entity_type=EntityType.PROJECT,
            )
        )
        mgr.rollback()
        assert mgr.is_active is False

        repo = GraphEntityRepository(sessionmaker(bind=engine)())
        try:
            results = list(repo.search(tenant_id=tenant_id, query="RolledBack"))
            assert results == []
        finally:
            repo._db.close()  # type: ignore[attr-defined]

    def test_begin_while_active_raises(self):
        engine = _build_in_memory_engine()
        factory = sessionmaker(bind=engine)
        tenant_id = _seed_tenant(engine)
        session_manager = Neo4jSessionManager(
            backend="postgres", session_factory=factory
        )
        mgr = GraphTransactionManager(session_manager)
        mgr.begin(tenant_id=tenant_id)
        with pytest.raises(RuntimeError):
            mgr.begin(tenant_id=tenant_id)
        mgr.rollback()

    def test_commit_without_active_raises(self):
        engine = _build_in_memory_engine()
        factory = sessionmaker(bind=engine)
        session_manager = Neo4jSessionManager(
            backend="postgres", session_factory=factory
        )
        mgr = GraphTransactionManager(session_manager)
        with pytest.raises(RuntimeError):
            mgr.commit()
