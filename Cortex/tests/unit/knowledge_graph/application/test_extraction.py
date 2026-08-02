"""
Unit tests for Entity and Relationship extraction services and pipeline.
"""

from __future__ import annotations

import uuid
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import pytest

from src.core.database import Base
from src.knowledge_graph.application.extraction import (
    EntityExtractionService,
    GraphExtractionPipeline,
    RelationshipExtractionService,
    RuleBasedExtractionProvider,
)
from src.knowledge_graph.domain.value_objects import EntityType, RelationshipType


@pytest.fixture
def sync_db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine)
    session = TestingSession()
    yield session
    session.close()


@pytest.mark.asyncio
async def test_entity_extraction_rule_based():
    provider = RuleBasedExtractionProvider()
    service = EntityExtractionService(provider)
    tenant_id = uuid.uuid4()

    text = "Cortex uses FastAPI and PostgreSQL for multi-tenant knowledge management."
    entities = await service.extract_entities(text, tenant_id=tenant_id)

    assert len(entities) >= 3
    names = [e.name for e in entities]
    assert "Cortex" in names
    assert "FastAPI" in names
    assert "PostgreSQL" in names


@pytest.mark.asyncio
async def test_relationship_extraction_rule_based():
    provider = RuleBasedExtractionProvider()
    ent_svc = EntityExtractionService(provider)
    rel_svc = RelationshipExtractionService(provider, confidence_threshold=0.5)
    tenant_id = uuid.uuid4()

    text = "Cortex uses FastAPI."
    entities = await ent_svc.extract_entities(text, tenant_id=tenant_id)
    rels = await rel_svc.extract_relationships(text, entities)

    assert len(rels) > 0
    assert rels[0].confidence >= 0.5
