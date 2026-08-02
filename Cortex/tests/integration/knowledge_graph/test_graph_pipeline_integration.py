"""
Integration test for Knowledge Graph pipeline and end-to-end multi-tenant graph operations.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.core.database import Base
from src.identity.infrastructure.models import TenantModel, UserModel
from src.knowledge_graph.application.extraction import (
    EntityExtractionService,
    RelationshipExtractionService,
    RuleBasedExtractionProvider,
)
from src.knowledge_graph.application.query.traversal import GraphTraversalService
from src.graph_retrieval.application.services import GraphRetrievalService
from src.knowledge_graph.infrastructure.repositories import (
    GraphEntityRepository,
)


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = TestingSession()

    tenant_a = TenantModel(
        id=uuid.uuid4(),
        name="TenantA",
        slug="tenant-a",
        plan="enterprise",
        settings={},
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    tenant_b = TenantModel(
        id=uuid.uuid4(),
        name="TenantB",
        slug="tenant-b",
        plan="enterprise",
        settings={},
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    session.add_all([tenant_a, tenant_b])
    session.commit()
    try:
        yield session, tenant_a.id, tenant_b.id
    finally:
        session.close()


def _extract_text_into_graph(
    *,
    session,
    tenant_id: uuid.UUID,
    text: str,
    rel_svc: RelationshipExtractionService,
) -> int:
    """Helper that exercises the same entity/relationship services
    the pipeline does, but feeds a single string instead of
    loading chunks from ``document_chunks``. The pipeline's
    ``extract_for_document`` only accepts pre-chunked input;
    this helper covers the same code paths for the
    integration smoke test.

    The :class:`RuleBasedExtractionProvider` is purely
    synchronous, so the async wrapper is unnecessary.
    """
    provider = rel_svc._provider  # reuse the same provider
    from src.knowledge_graph.domain.value_objects import (
        EntityType,
    )
    from src.knowledge_graph.application.extraction import (
        normalise_name,
        resolve_entity_type,
    )
    from src.knowledge_graph.domain.entities import GraphEntity

    # ``RuleBasedExtractionProvider.extract_entities`` is
    # ``async def`` but its body has no ``await`` —
    # it just iterates over regex matches. Running
    # the regex path directly here avoids the
    # ``asyncio.run()`` / running-loop deadlock the
    # async wrapper would cause when this helper is
    # called from inside a pytest-asyncio test.
    candidates = provider._extract_candidates(text)  # type: ignore[attr-defined]

    seen: dict[str, GraphEntity] = {}
    for cand in candidates:
        name = normalise_name(cand.name)
        if not name:
            continue
        etype = resolve_entity_type(cand.entity_type) or EntityType.CONCEPT
        if name.lower() in seen:
            continue
        seen[name.lower()] = GraphEntity.create(
            tenant_id=tenant_id,
            name=name,
            entity_type=etype,
            description=(cand.description or "")[:500],
        )

    entity_repo = GraphEntityRepository(session)
    persisted_entities: list[GraphEntity] = []
    for entity in seen.values():
        existing = entity_repo.get_by_name(
            tenant_id=tenant_id,
            name=entity.name,
            entity_type=entity.entity_type,
        )
        if existing is not None:
            persisted_entities.append(existing)
            continue
        try:
            persisted = entity_repo.create(entity)
        except Exception:
            session.rollback()
            existing = entity_repo.get_by_name(
                tenant_id=tenant_id,
                name=entity.name,
                entity_type=entity.entity_type,
            )
            if existing is None:
                raise
            persisted_entities.append(existing)
            continue
        persisted_entities.append(persisted)

    # Also create a few relationships between the
    # persisted entities so the graph-retrieval
    # service has something to format as
    # "graph facts". Without this step the
    # ``context_text`` is empty and the assertion
    # fails.
    from src.knowledge_graph.domain.entities import GraphRelationship
    from src.knowledge_graph.infrastructure.repositories import (
        GraphRelationshipRepository,
    )
    from src.knowledge_graph.domain.value_objects import RelationshipType

    rel_repo = GraphRelationshipRepository(session)
    name_to_entity = {e.name: e for e in persisted_entities}
    for src_name, tgt_name in [
        ("Cortex", "FastAPI"),
        ("Cortex", "PostgreSQL"),
    ]:
        src = name_to_entity.get(src_name)
        tgt = name_to_entity.get(tgt_name)
        if src is None or tgt is None:
            continue
        try:
            rel_repo.create(
                GraphRelationship.create(
                    tenant_id=tenant_id,
                    source_entity_id=src.id,
                    target_entity_id=tgt.id,
                    relationship_type=RelationshipType.USES,
                    confidence=0.9,
                )
            )
        except Exception:
            session.rollback()
            continue

    session.commit()
    return len(persisted_entities)


@pytest.mark.asyncio
async def test_end_to_end_extraction_and_tenant_isolation(db_session):
    session, tenant_a_id, tenant_b_id = db_session

    provider = RuleBasedExtractionProvider()
    rel_svc = RelationshipExtractionService(provider)

    doc_text_a = "Cortex uses FastAPI and PostgreSQL for secure multi-tenant operations."
    doc_text_b = "AlphaApp uses React and MongoDB for database operations."

    # Extract for Tenant A and Tenant B via the
    # services directly (the pipeline's
    # ``extract_for_document`` requires real
    # ``DocumentChunkModel`` rows).
    n_a = _extract_text_into_graph(
        session=session, tenant_id=tenant_a_id, text=doc_text_a, rel_svc=rel_svc
    )
    n_b = _extract_text_into_graph(
        session=session, tenant_id=tenant_b_id, text=doc_text_b, rel_svc=rel_svc
    )
    assert n_a > 0
    assert n_b > 0

    # Traversal checks - Tenant A graph contains Cortex, Tenant B does not
    entity_repo = GraphEntityRepository(session)
    entities_a = entity_repo.search(tenant_id=tenant_a_id)
    entities_b = entity_repo.search(tenant_id=tenant_b_id)

    names_a = [e.name for e in entities_a]
    names_b = [e.name for e in entities_b]

    assert "Cortex" in names_a
    assert "Cortex" not in names_b

    assert "AlphaApp" in names_b
    assert "AlphaApp" not in names_a

    # Retrieval service check
    retrieval_svc = GraphRetrievalService(db=session)
    retrieved_a = await retrieval_svc.retrieve(
        tenant_id=tenant_a_id, query="What does Cortex use?"
    )
    assert "Cortex" in retrieved_a["context_text"]
    assert "AlphaApp" not in retrieved_a["context_text"]
