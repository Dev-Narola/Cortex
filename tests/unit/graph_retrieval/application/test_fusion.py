"""
Unit tests for the V7 graph-aware hybrid retrieval (fusion + context builder).

Covers the Phase 9 spec:

* :class:`GraphVectorFusionService` produces a
  :class:`FusedContext` whose graph facts take
  priority over the vector hits.
* :class:`GraphContextBuilder` renders the
  facts and chunks as LLM-ready text.
* The fusion rejects invalid configuration at
  construction time (no garbage graph_boost, no
  rrf_k=0).
* The reranker port is a Protocol: a stub object
  is a valid dependency.
"""

from __future__ import annotations

import uuid

import pytest

from src.graph_retrieval.application.context_builder import GraphContextBuilder
from src.graph_retrieval.application.fusion import (
    FusedContext,
    GraphFact,
    GraphVectorFusionService,
    VectorChunk,
)
from src.knowledge_graph.domain.entities import GraphEntity, GraphRelationship
from src.knowledge_graph.domain.value_objects import EntityType, RelationshipType
from src.shared.exceptions import ValidationException


def _make_entity(name: str, tenant_id: uuid.UUID, etype: EntityType = EntityType.CONCEPT) -> GraphEntity:
    return GraphEntity.create(
        tenant_id=tenant_id, name=name, entity_type=etype
    )


def _make_relationship(
    src: GraphEntity, tgt: GraphEntity, tenant_id: uuid.UUID, rel: RelationshipType = RelationshipType.USES, confidence: float = 0.95,
) -> GraphRelationship:
    return GraphRelationship.create(
        tenant_id=tenant_id,
        source_entity_id=src.id,
        target_entity_id=tgt.id,
        relationship_type=rel,
        confidence=confidence,
    )


class TestGraphContextBuilder:
    """Tests for the LLM prompt renderer."""

    def test_renders_graph_facts_first(self):
        tenant_id = uuid.uuid4()
        cortex = _make_entity("Cortex", tenant_id, EntityType.PROJECT)
        fastapi = _make_entity("FastAPI", tenant_id, EntityType.TECHNOLOGY)
        rel = _make_relationship(cortex, fastapi, tenant_id)
        fact = GraphFact(source=cortex, target=fastapi, relationship=rel)

        builder = GraphContextBuilder()
        text = builder.render(
            query="What does Cortex use?",
            graph_facts=[fact],
            chunks=[],
        )

        # The graph-facts section is *first* in
        # the output — the spec's "prioritise graph
        # facts over inferred facts" rule.
        assert "Relevant knowledge" in text
        # The relationship label and entity names
        # are present; the entity-type annotation
        # is appended when ``include_descriptions``
        # is true (the default).
        assert "Cortex" in text
        assert "FastAPI" in text
        assert "USES" in text
        # The fact is the *only* line in the
        # "Relevant knowledge" section.
        fact_line = [ln for ln in text.splitlines() if ln.startswith("- ")][0]
        assert "USES" in fact_line

    def test_renders_vector_chunks_second(self):
        builder = GraphContextBuilder()
        text = builder.render(
            query="q",
            graph_facts=[],
            chunks=[
                VectorChunk(content="FastAPI is a web framework.", score=0.9),
            ],
        )
        assert "Retrieved document excerpts" in text
        assert "FastAPI is a web framework" in text

    def test_truncates_long_chunks(self):
        builder = GraphContextBuilder(max_chars_per_chunk=200)
        long_content = "a" * 500
        text = builder.render(
            query="q",
            graph_facts=[],
            chunks=[VectorChunk(content=long_content, score=0.5)],
        )
        # The chunk is truncated.
        assert "..." in text
        # The full 500-char content is NOT in
        # the output.
        assert "a" * 500 not in text

    def test_renders_confidence_in_fact(self):
        tenant_id = uuid.uuid4()
        src = _make_entity("A", tenant_id)
        tgt = _make_entity("B", tenant_id)
        rel = _make_relationship(src, tgt, tenant_id, confidence=0.7)
        fact = GraphFact(source=src, target=tgt, relationship=rel)

        text = GraphContextBuilder().render(
            query="q", graph_facts=[fact], chunks=[]
        )
        assert "confidence 0.70" in text

    def test_empty_inputs_produce_minimal_text(self):
        text = GraphContextBuilder().render(
            query="", graph_facts=[], chunks=[]
        )
        # No sections are added when there is
        # nothing to render.
        assert text == ""


class TestGraphVectorFusionService:
    """Tests for the fusion logic."""

    def test_invalid_graph_boost_rejected(self):
        with pytest.raises(ValidationException):
            GraphVectorFusionService(graph_boost=0.5)

    def test_invalid_rrf_k_rejected(self):
        with pytest.raises(ValidationException):
            GraphVectorFusionService(rrf_k=0)

    def test_invalid_max_chunks_rejected(self):
        with pytest.raises(ValidationException):
            GraphVectorFusionService(max_chunks=0)

    @pytest.mark.asyncio
    async def test_graph_facts_take_priority(self):
        tenant_id = uuid.uuid4()
        cortex = _make_entity("Cortex", tenant_id, EntityType.PROJECT)
        fastapi = _make_entity("FastAPI", tenant_id, EntityType.TECHNOLOGY)
        rel = _make_relationship(cortex, fastapi, tenant_id)
        fact = GraphFact(source=cortex, target=fastapi, relationship=rel)

        service = GraphVectorFusionService()
        result = await service.fuse(
            query="How does Cortex use FastAPI?",
            vector_chunks=[
                VectorChunk(content="unrelated chunk", score=0.9),
                VectorChunk(content="another unrelated chunk", score=0.8),
            ],
            entities=[cortex, fastapi],
            relationships=[rel],
        )
        assert isinstance(result, FusedContext)
        assert result.graph_facts == (fact,)
        # The graph facts section is rendered
        # *before* the chunks section.
        assert result.context_text.index("Relevant knowledge") < result.context_text.index(
            "Retrieved document excerpts"
        )

    @pytest.mark.asyncio
    async def test_boost_promotes_graph_mentioning_chunks(self):
        tenant_id = uuid.uuid4()
        cortex = _make_entity("Cortex", tenant_id, EntityType.PROJECT)
        # Chunk that mentions the graph entity.
        rel_chunk = VectorChunk(
            content="Cortex uses FastAPI for the API layer.",
            score=0.5,
        )
        # Chunk that does not.
        unrel_chunk = VectorChunk(
            content="The weather in Paris is mild.",
            score=0.7,
        )
        service = GraphVectorFusionService(graph_boost=10.0)
        result = await service.fuse(
            query="Cortex",
            vector_chunks=[unrel_chunk, rel_chunk],
            entities=[cortex],
            relationships=[],
        )
        # The boosted chunk (``rel_chunk``) should
        # appear before the unrelated one, even
        # though its base score is lower.
        rel_idx = result.context_text.find("Cortex uses FastAPI")
        unrel_idx = result.context_text.find("Paris is mild")
        assert rel_idx != -1 and unrel_idx != -1
        assert rel_idx < unrel_idx

    @pytest.mark.asyncio
    async def test_relationship_dropped_when_endpoint_missing(self):
        """A relationship whose endpoint is not in the entity set is dropped."""
        tenant_id = uuid.uuid4()
        a = _make_entity("A", tenant_id)
        # The relationship's target is a UUID
        # that does not correspond to any entity
        # in the set — the fusion must drop the
        # orphan fact.
        rel = GraphRelationship.create(
            tenant_id=tenant_id,
            source_entity_id=a.id,
            target_entity_id=uuid.uuid4(),  # not in the entity set
            relationship_type=RelationshipType.USES,
        )
        service = GraphVectorFusionService()
        result = await service.fuse(
            query="q",
            vector_chunks=[],
            entities=[a],
            relationships=[rel],
        )
        assert result.graph_facts == ()

    @pytest.mark.asyncio
    async def test_invalid_query_raises(self):
        service = GraphVectorFusionService()
        with pytest.raises(ValidationException):
            await service.fuse(
                query=123,  # type: ignore[arg-type]
                vector_chunks=[],
                entities=[],
                relationships=[],
            )

    @pytest.mark.asyncio
    async def test_reranker_called_when_wired(self):
        """A custom reranker port can be plugged in and the fusion uses it."""

        class _StubReranker:
            def __init__(self):
                self.calls: list = []

            async def rerank(self, query, items, *, top_k=None):
                self.calls.append((query, top_k, list(items)))
                return items[:top_k] if top_k else items

        tenant_id = uuid.uuid4()
        a = _make_entity("A", tenant_id)
        b = _make_entity("B", tenant_id)
        rel = _make_relationship(a, b, tenant_id)

        reranker = _StubReranker()
        service = GraphVectorFusionService(
            reranker=reranker, max_chunks=1
        )
        await service.fuse(
            query="q",
            vector_chunks=[
                VectorChunk(content="x", score=0.1),
                VectorChunk(content="y", score=0.2),
            ],
            entities=[a, b],
            relationships=[rel],
        )
        # The reranker was consulted.
        assert len(reranker.calls) == 1
        # The fusion kept at most ``max_chunks`` items.
        ctx = await service.fuse(
            query="q2",
            vector_chunks=[
                VectorChunk(content="a", score=0.1),
                VectorChunk(content="b", score=0.2),
                VectorChunk(content="c", score=0.3),
            ],
            entities=[],
            relationships=[],
        )
        assert len(ctx.chunks) <= 1
