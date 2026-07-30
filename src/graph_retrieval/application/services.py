"""
Graph-aware retrieval service for Cortex RAG and Agent pipelines.

Flow:
    User Question
         │
         ├──► Vector/Hybrid Search (text chunks)
         ├──► Knowledge Graph Search (entities + relationships)
         │
         ▼
     Merge & Rank Context
         │
         ▼
  Prioritised Graph Facts + Vector Excerpts Context

The service has two public methods:

* :meth:`retrieve` — the V7 Part 2 output shape:
  a flat dict with ``entities``, ``relationships``,
  ``vector_results``, ``graph_facts``, and
  ``context_text``. The dict is what the V6 agent
  executor and the conversation pipeline consume.
  Kept stable so callers do not have to change.

* :meth:`retrieve_fused` — the V7 Part 3 output
  shape. Delegates to the
  :class:`GraphVectorFusionService` for the
  actual fusion and to the
  :class:`GraphContextBuilder` for the prompt
  rendering. The result is a
  :class:`FusedContext` with a pre-rendered
  ``context_text`` the prompt-building code can
  pass straight to the LLM.
"""

from __future__ import annotations

import re
import uuid
from typing import Any

from sqlalchemy.orm import Session

from src.graph_retrieval.application.fusion import (
    FusedContext,
    GraphVectorFusionService,
)
from src.knowledge_graph.application.traversal import (
    GraphSearchService,
    GraphTraversalService,
)
from src.knowledge_graph.domain.entities import GraphEntity, GraphRelationship
from src.retrieval.application.search_service import HybridSearchService
from src.shared.exceptions import ValidationException


class GraphRetrievalService:
    """Service combining vector search with Knowledge Graph retrieval."""

    def __init__(
        self,
        db: Session,
        hybrid_search_service: HybridSearchService | None = None,
        graph_search_service: GraphSearchService | None = None,
        graph_traversal_service: GraphTraversalService | None = None,
        fusion_service: GraphVectorFusionService | None = None,
    ) -> None:
        self._db = db
        self._hybrid_search = hybrid_search_service
        self._search_service = graph_search_service or GraphSearchService(db)
        self._traversal_service = graph_traversal_service or GraphTraversalService(db)
        # The fusion service is optional so a
        # caller that only wants the graph side
        # (e.g. the V6 agent executor's pre-loop
        # graph augmentation) can construct the
        # service without one. When ``None`` the
        # V7 Part 2 ``retrieve`` behaviour is
        # preserved verbatim.
        self._fusion_service = fusion_service

    def retrieve_entities(
        self,
        *,
        tenant_id: uuid.UUID,
        query: str,
        limit: int = 5,
    ) -> list[GraphEntity]:
        """Extract candidate entities from query by substring matching entity names."""
        if not isinstance(tenant_id, uuid.UUID):
            raise ValidationException(message="tenant_id must be a UUID", code=400)
        if not isinstance(query, str) or not query.strip():
            return []

        # 1. Direct search by query text
        matched = list(self._search_service.search_entities(tenant_id=tenant_id, query=query, limit=limit))

        # 2. Extract keywords/capitalized tokens from query
        tokens = [w.strip() for w in re.findall(r"\b[A-Za-z0-9_\-]+\b", query) if len(w.strip()) > 2]
        seen_ids: set[uuid.UUID] = {e.id for e in matched}

        for token in tokens:
            if len(matched) >= limit:
                break
            candidates = self._search_service.search_entities(tenant_id=tenant_id, query=token, limit=3)
            for c in candidates:
                if c.id not in seen_ids:
                    seen_ids.add(c.id)
                    matched.append(c)
                    if len(matched) >= limit:
                        break

        return matched[:limit]

    def retrieve_relationships(
        self,
        *,
        tenant_id: uuid.UUID,
        entity_ids: list[uuid.UUID],
    ) -> list[GraphRelationship]:
        """Retrieve relationships connecting the provided set of entity IDs."""
        if not isinstance(tenant_id, uuid.UUID) or not entity_ids:
            return []

        entity_set = set(entity_ids)
        rels: list[GraphRelationship] = []
        seen_rel_ids: set[uuid.UUID] = set()

        for eid in entity_ids:
            node_rels = self._search_service.search_relationships(
                tenant_id=tenant_id, entity_id=eid, limit=20
            )
            for r in node_rels:
                if r.id not in seen_rel_ids:
                    # Filter relationships connecting the matched entities or with high confidence
                    if r.source_entity_id in entity_set or r.target_entity_id in entity_set:
                        seen_rel_ids.add(r.id)
                        rels.append(r)

        return rels

    async def retrieve(
        self,
        *,
        tenant_id: uuid.UUID,
        query: str,
        limit: int = 5,
    ) -> dict[str, Any]:
        """Perform hybrid retrieval: vector search + Knowledge Graph search merged into unified context."""
        if not isinstance(tenant_id, uuid.UUID):
            raise ValidationException(message="tenant_id must be a UUID", code=400)
        if not isinstance(query, str) or not query.strip():
            raise ValidationException(message="query must be a non-empty string", code=400)

        # 1. Graph retrieval
        graph_entities = self.retrieve_entities(tenant_id=tenant_id, query=query, limit=limit)
        entity_ids = [e.id for e in graph_entities]
        graph_rels = self.retrieve_relationships(tenant_id=tenant_id, entity_ids=entity_ids)

        # 2. Vector search (if hybrid search service is available)
        vector_results = []
        if self._hybrid_search is not None:
            try:
                vector_results = await self._hybrid_search.search(
                    tenant_id=tenant_id,
                    query=query,
                    top_k=limit,
                )
            except Exception:
                vector_results = []

        # 3. Format graph facts (prioritised)
        graph_facts: list[str] = []
        name_map = {e.id: e.name for e in graph_entities}
        for rel in graph_rels:
            src = name_map.get(rel.source_entity_id, str(rel.source_entity_id))
            tgt = name_map.get(rel.target_entity_id, str(rel.target_entity_id))
            label = rel.relationship_type.value if hasattr(rel.relationship_type, "value") else str(rel.relationship_type)
            graph_facts.append(f"{src} {label.upper()} {tgt} (confidence: {rel.confidence:.2f})")

        # Format vector chunk contents
        vector_chunks: list[str] = []
        for v in vector_results:
            content = getattr(v, "content", getattr(v, "text", str(v)))
            vector_chunks.append(content)

        # Build merged context text prioritizing explicit graph facts
        context_parts = []
        if graph_facts:
            context_parts.append("### Knowledge Graph Facts (Prioritised):\n" + "\n".join(f"- {f}" for f in graph_facts))
        if vector_chunks:
            context_parts.append("### Retrieved Document Excerpts:\n" + "\n\n".join(vector_chunks))

        context_text = "\n\n".join(context_parts)

        return {
            "query": query,
            "entities": graph_entities,
            "relationships": graph_rels,
            "vector_results": vector_results,
            "graph_facts": graph_facts,
            "context_text": context_text,
        }

    async def retrieve_fused(
        self,
        *,
        tenant_id: uuid.UUID,
        query: str,
        limit: int = 5,
    ) -> FusedContext:
        """Hybrid retrieval with graph-priority fusion.

        The flow:

        1. Run the same entity / relationship
           lookup as :meth:`retrieve`.
        2. Run vector search (if a hybrid search
           service is wired).
        3. Hand the two streams to the
           :class:`GraphVectorFusionService` for
           RRF + graph-priority boost + optional
           rerank.
        4. Return the fused context with a
           pre-rendered ``context_text`` ready
           for the LLM prompt.

        If no fusion service is wired, the
        method falls back to a synchronous in-
        memory implementation that produces the
        same :class:`FusedContext` shape — the
        call site does not have to know whether
        a real fusion service is configured.
        """
        if not isinstance(tenant_id, uuid.UUID):
            raise ValidationException(message="tenant_id must be a UUID", code=400)
        if not isinstance(query, str) or not query.strip():
            raise ValidationException(message="query must be a non-empty string", code=400)

        # 1. Graph side: same logic as ``retrieve``.
        graph_entities = self.retrieve_entities(
            tenant_id=tenant_id, query=query, limit=limit
        )
        entity_ids = [e.id for e in graph_entities]
        graph_rels = self.retrieve_relationships(
            tenant_id=tenant_id, entity_ids=entity_ids
        )

        # 2. Vector side: best-effort. The hybrid
        #    search service is optional (a test
        #    environment without a real V3
        #    ``HybridSearchService`` still works).
        vector_results: list[Any] = []
        if self._hybrid_search is not None:
            try:
                vector_results = await self._hybrid_search.search(
                    tenant_id=tenant_id,
                    query=query,
                    top_k=limit,
                )
            except Exception:  # noqa: BLE001 - vector is best-effort
                vector_results = []

        # 3. Delegate to the fusion service. The
        #    fallback path is a no-reranker
        #    :class:`GraphVectorFusionService`
        #    constructed on demand; the output
        #    shape is the same.
        fusion = self._fusion_service or GraphVectorFusionService()
        return await fusion.fuse(
            query=query,
            vector_chunks=vector_results,
            entities=graph_entities,
            relationships=graph_rels,
        )


__all__ = ["GraphRetrievalService"]
