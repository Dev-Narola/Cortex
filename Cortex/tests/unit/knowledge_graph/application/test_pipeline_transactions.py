"""
KG pipeline transaction safety (prod deadlock, 2026-10-18).

Two extraction jobs on one event loop deadlocked: one held an open
transaction across an LLM ``await`` while the other's sync INSERT waited on
its row lock, blocking the loop. The pipeline must never hold a transaction
across an await, and relationships must point at persisted entity rows.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from src.core.database import Base
from src.identity.infrastructure.models import TenantModel, UserModel
from src.identity.infrastructure.security import hash_password
from src.ingestion.infrastructure.models import DocumentChunkModel, DocumentModel
from src.knowledge_graph.application.extraction import (
    EntityExtractionService,
    GraphExtractionPipeline,
    RelationshipExtractionService,
    RuleBasedExtractionProvider,
)
from src.knowledge_graph.domain.entities import GraphEntity
from src.knowledge_graph.infrastructure.models import KGEntityModel as GraphEntityModel
from src.knowledge_graph.infrastructure.models import KGRelationModel as GraphRelationshipModel
from src.knowledge_graph.infrastructure.repositories import GraphEntityRepository


class _AssertNoOpenTransaction(RuleBasedExtractionProvider):
    def __init__(self, session):
        super().__init__()
        self.session = session
        self.calls = 0
        self.violations = 0

    async def extract_entities(self, *args, **kwargs):
        self._check()
        return await super().extract_entities(*args, **kwargs)

    async def extract_relationships(self, *args, **kwargs):
        self._check()
        return await super().extract_relationships(*args, **kwargs)

    def _check(self):
        # A failed assert here would surface as a skipped chunk, so record it.
        self.calls += 1
        if self.session.in_transaction():
            self.violations += 1


@pytest.fixture
def seeded():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    now = datetime.now(UTC)
    tenant = TenantModel(id=uuid.uuid4(), name="T", slug=f"t-{uuid.uuid4().hex[:8]}",
                         created_at=now, updated_at=now)
    user = UserModel(id=uuid.uuid4(), tenant_id=tenant.id, email="u@x.com",
                     password_hash=hash_password("x-test-password"), role="owner",
                     created_at=now, updated_at=now)
    doc = DocumentModel(id=uuid.uuid4(), tenant_id=tenant.id, created_by=user.id, title="d",
                        source_type="upload", status="indexed", mime_type="text/plain",
                        storage_uri="s3://b/k", created_at=now)
    db.add_all([tenant, user, doc])
    db.flush()
    for i, text in enumerate([
        "Cortex uses FastAPI and PostgreSQL for knowledge management.",
        "Cortex stores vectors in PostgreSQL with pgvector.",
    ]):
        db.add(DocumentChunkModel(id=uuid.uuid4(), document_id=doc.id, tenant_id=tenant.id,
                                  content=text, chunk_index=i, token_count=10,
                                  chunk_metadata={}, created_at=now))
    db.commit()
    # An entity a previous document already created.
    existing = GraphEntityRepository(db).create(
        GraphEntity.create(tenant_id=tenant.id, name="Cortex", entity_type="concept")
    )
    db.commit()
    yield db, tenant.id, doc.id, existing
    db.close()


async def test_no_transaction_across_awaits_and_persisted_ids(seeded):
    db, tenant_id, doc_id, existing = seeded
    provider = _AssertNoOpenTransaction(db)
    pipeline = GraphExtractionPipeline(
        db=db,
        entity_service=EntityExtractionService(provider),
        relationship_service=RelationshipExtractionService(provider, confidence_threshold=0.0),
    )
    result = await pipeline.extract_for_document(tenant_id=tenant_id, document_id=doc_id)
    assert not db.in_transaction(), "pipeline left a transaction open"

    assert provider.calls >= 3 and provider.violations == 0
    entity_ids = set(db.execute(select(GraphEntityModel.id)).scalars())
    cortex_rows = db.execute(
        select(GraphEntityModel).where(GraphEntityModel.name == "Cortex")
    ).scalars().all()
    assert [r.id for r in cortex_rows] == [existing.id]  # reused, not duplicated
    rels = db.execute(select(GraphRelationshipModel)).scalars().all()
    assert rels, "expected relationships between co-occurring entities"
    for r in rels:
        assert r.source_entity_id in entity_ids and r.target_entity_id in entity_ids
    assert result.metrics.chunks_processed == 2
