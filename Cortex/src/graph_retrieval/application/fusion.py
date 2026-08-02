"""
Graph + Vector fusion for hybrid retrieval (V7 — Phase 9).

The V3 retrieval layer produced vector + keyword hits
and fused them with RRF. The V7 addition is a third
signal — the knowledge graph — that the V3 layer
does not know about. This module is the
adapter that takes the two output streams and
produces a unified, ordered context for the LLM.

The fusion strategy mirrors the spec:

  Query
     │
     ├─► Vector Search     ─┐
     │                      │
     └─► Graph Search      ─┤
                            │
                            ▼
                      Context Fusion
                            │
                            ▼
                       (Reranker)
                            │
                            ▼
                           LLM

The two inputs are *typed* and *isolated*:

* ``vector_chunks`` is a list of objects with at
  minimum ``content`` and ``score`` attributes
  (the V3 ``SearchResult`` shape).
* ``graph_entities`` and ``graph_relationships``
  are the V7 domain objects from
  :mod:`src.knowledge_graph.domain.entities`.

The fusion service is the only place that knows
about both. Keeping the V3 retrieval code unaware
of V7 means V3 stays the canonical RAG path; the
graph augmentation is opt-in via DI.

Why a custom fusion rather than reusing RRF
verbatim: the two result types are not
commensurable on the same scale. RRF takes a
rank per source; the graph facts are *already
filtered* to the entity set the question is
about, while the vector hits are 50-100
unfiltered candidates. The fusion below uses
RRF for the vector stream and a *graph
priority boost* for the graph stream — a graph
fact that mentions an entity the question
*also* names scores above the vector hits.
"""

from __future__ import annotations

import hashlib
import logging
import uuid
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any, Protocol

from src.knowledge_graph.domain.entities import GraphEntity, GraphRelationship
from src.knowledge_graph.domain.value_objects import (
    EntityType,
    RelationshipType,
)
from src.shared.exceptions import ValidationException

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Source types
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class VectorChunk:
    """A minimal vector-search hit.

    The shape is intentionally narrow: the V3
    retrieval service's :class:`SearchResult`
    dataclass has more fields, but the fusion
    service only needs the content and the score.
    Tests pass ad-hoc duck-typed objects; the
    production path passes ``SearchResult``
    instances.
    """

    content: str
    score: float
    document_id: uuid.UUID | None = None
    chunk_id: uuid.UUID | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_search_result(cls, result: Any) -> "VectorChunk":
        """Adapt a V3 :class:`SearchResult` to the fusion shape.

        The method is the only place that
        introspects the V3 result type. Keeping
        the import / shape knowledge here
        (rather than in the fusion logic) means
        the fusion stays decoupled from the V3
        package.
        """
        content = (
            getattr(result, "content", None)
            or getattr(result, "text", None)
            or getattr(result, "chunk_content", "")
            or ""
        )
        score = float(getattr(result, "score", 0.0) or 0.0)
        return cls(
            content=content,
            score=score,
            document_id=getattr(result, "document_id", None),
            chunk_id=getattr(result, "chunk_id", None),
            metadata=dict(getattr(result, "metadata", {}) or {}),
        )


@dataclass(frozen=True, slots=True)
class GraphFact:
    """A typed graph fact (entity + relationship triple).

    The dataclass is the fusion service's
    *output* unit: the context builder (in
    :mod:`src.graph_retrieval.application.context_builder`)
    renders it as an LLM-ready sentence.
    """

    source: GraphEntity
    target: GraphEntity
    relationship: GraphRelationship


# ---------------------------------------------------------------------------
# Reranker port (Protocol)
# ---------------------------------------------------------------------------


class RerankerPort(Protocol):
    """The minimal surface the fusion needs from a reranker.

    The V3 platform ships an identity reranker and
    a Cohere / cross-encoder reranker; the fusion
    service depends on this protocol so the test
    suite can stub a deterministic reordering.
    """

    async def rerank(
        self,
        query: str,
        items: Sequence[Any],
        *,
        top_k: int | None = None,
    ) -> list[Any]:
        ...


# ---------------------------------------------------------------------------
# Output types
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class FusedContext:
    """The fusion's output.

    The shape is what the V3 retrieval service
    hands to the LLM. Three layers, in priority
    order:

    * ``graph_facts`` — the graph-derived
      sentences. These are *always* included
      when present and take priority over the
      vector hits.
    * ``chunks`` — the fused vector hits after
      RRF + rerank, in score-descending order.
    * ``context_text`` — the rendered string
      the LLM sees.

    A pre-rendered ``context_text`` keeps the
    prompt-building code (in
    :mod:`src.conversation.application.services`)
    unchanged: it reads the same ``context_text``
    field whether the fusion is on or off.
    """

    query: str
    graph_facts: tuple[GraphFact, ...]
    chunks: tuple[VectorChunk, ...]
    context_text: str
    entities: tuple[GraphEntity, ...] = ()
    relationships: tuple[GraphRelationship, ...] = ()


# ---------------------------------------------------------------------------
# GraphVectorFusionService
# ---------------------------------------------------------------------------


class GraphVectorFusionService:
    """Fuse vector-search results with knowledge-graph facts.

    The service is *stateless* and *side-effect-free*:
    callers pass the two input streams and the
    fusion produces a :class:`FusedContext`. The
    caller (the V3 retrieval service or the V6
    agent loop) is responsible for rendering the
    output into a prompt.

    The fusion is **graph-priority**: when a graph
    fact is present, it is rendered *first* in
    the output. The vector hits are interleaved
    after the graph facts in score-descending
    order. The order is the spec's "prioritise
    graph facts over inferred facts" rule.

    Parameters
    ----------
    reranker
        Optional reranker. The default ``None``
        means "no reranking" — the fusion still
        sorts by score but does not re-rank. A
        production deployment wires in the V3
        platform's ``CohereReranker`` or
        ``IdentityReranker`` via DI.
    graph_boost
        Multiplier applied to the score of any
        chunk whose content mentions an entity
        name from the graph set. Default 1.5 —
        empirically enough to push a relevant
        vector hit above an irrelevant one, not
        so much it crowds out the graph facts
        themselves.
    rrf_k
        The RRF constant. ``60`` is the standard
        value (the V3 retrieval service uses the
        same default; the constant is named
        here so the fusion can be tuned without
        touching V3).
    max_chunks
        Hard cap on the number of vector hits
        the fusion returns. The LLM context
        window is the binding constraint; the
        default 8 is generous for a 4k-token
        prompt.
    """

    def __init__(
        self,
        *,
        reranker: RerankerPort | None = None,
        graph_boost: float = 1.5,
        rrf_k: int = 60,
        max_chunks: int = 8,
    ) -> None:
        if graph_boost < 1.0:
            raise ValidationException(
                message="graph_boost must be >= 1.0 (otherwise graph facts lose priority)",
                code=400,
                data={"field": "graph_boost", "value": graph_boost},
            )
        if rrf_k < 1:
            raise ValidationException(
                message="rrf_k must be >= 1",
                code=400,
                data={"field": "rrf_k", "value": rrf_k},
            )
        if max_chunks < 1:
            raise ValidationException(
                message="max_chunks must be >= 1",
                code=400,
                data={"field": "max_chunks", "value": max_chunks},
            )
        self._reranker = reranker
        self._graph_boost = float(graph_boost)
        self._rrf_k = int(rrf_k)
        self._max_chunks = int(max_chunks)

    # --- public surface ---------------------------------------------

    async def fuse(
        self,
        *,
        query: str,
        vector_chunks: Sequence[Any],
        entities: Sequence[GraphEntity],
        relationships: Sequence[GraphRelationship],
    ) -> FusedContext:
        """Fuse the two streams and return a :class:`FusedContext`.

        The method is async because the optional
        reranker may be a Cohere / cross-encoder
        call. The non-reranker path is fully
        synchronous inside.
        """
        if not isinstance(query, str):
            raise ValidationException(
                message="query must be a string",
                code=400,
                data={"field": "query"},
            )

        # 1. Build the graph facts. The
        #    relationship → entity lookup is a
        #    single dict build; the dedup
        #    (a (source, target, type) triple)
        #    is implicit because the input
        #    relationship list already came from
        #    a SELECT DISTINCT-style query.
        graph_facts = self._build_graph_facts(
            entities=entities, relationships=relationships
        )
        entity_names = {e.name.lower() for e in entities}
        # ``canonical_id``-aware: when two
        # entities have the same name we keep
        # the canonical (the one without a
        # ``canonical_id`` pointer). The merge
        # layer is upstream; here we just dedup
        # by name.
        seen_names: set[str] = set()
        unique_entities: list[GraphEntity] = []
        for ent in entities:
            key = ent.name.lower()
            if key in seen_names:
                continue
            seen_names.add(key)
            unique_entities.append(ent)

        # 2. Adapt the V3 vector hits to the
        #    fusion shape. The adapter is the
        #    only place that introspects the
        #    ``SearchResult`` type.
        adapted_chunks = [
            VectorChunk.from_search_result(r) for r in vector_chunks
        ]

        # 3. Score + RRF. Each chunk gets a
        #    base score from its own ``score``,
        #    plus a boost when the chunk's
        #    content mentions an entity name
        #    from the graph set.
        scored = [
            (
                self._score_with_boost(chunk, entity_names),
                idx,
                chunk,
            )
            for idx, chunk in enumerate(adapted_chunks)
        ]
        # RRF blend: the base RRF score uses the
        # *position* in the input list, so an
        # early hit is worth more than a later
        # hit. The boost is added on top.
        fused: list[tuple[float, VectorChunk]] = []
        for boost_score, idx, chunk in scored:
            rrf = 1.0 / (self._rrf_k + idx + 1)
            fused.append((rrf + boost_score, chunk))
        fused.sort(key=lambda t: (-t[0], t[1].content))

        # 4. Rerank. The reranker may reorder
        #    the top-N. Below the reranker's
        #    cut, the RRF order is preserved.
        if self._reranker is not None and fused:
            try:
                reranked = await self._reranker.rerank(
                    query,
                    [c for _, c in fused[: self._max_chunks * 2]],
                    top_k=self._max_chunks,
                )
                reranked_chunks = [
                    VectorChunk.from_search_result(r) for r in reranked
                ]
                # Anything the reranker dropped
                # beyond ``top_k`` is appended in
                # RRF order.
                seen_ids = {
                    self._content_key(c.content) for c in reranked_chunks
                }
                extras = [
                    c
                    for _, c in fused
                    if self._content_key(c.content) not in seen_ids
                ]
                top_chunks = (reranked_chunks + extras)[: self._max_chunks]
            except Exception as exc:  # noqa: BLE001 - reranker is best-effort
                logger.warning(
                    "fusion.reranker_failed",
                    extra={"query": query[:120], "error": str(exc)},
                )
                top_chunks = [c for _, c in fused[: self._max_chunks]]
        else:
            top_chunks = [c for _, c in fused[: self._max_chunks]]

        # 5. Render the context text. The
        #    renderer is the only thing the
        #    :class:`GraphContextBuilder`
        #    module owns; the fusion delegates
        #    to it so the rendering rules live
        #    in one place.
        from src.graph_retrieval.application.context_builder import (
            GraphContextBuilder,
        )

        context_text = GraphContextBuilder(
            graph_boost=self._graph_boost
        ).render(
            query=query,
            graph_facts=list(graph_facts),
            chunks=list(top_chunks),
        )

        return FusedContext(
            query=query,
            graph_facts=tuple(graph_facts),
            chunks=tuple(top_chunks),
            context_text=context_text,
            entities=tuple(unique_entities),
            relationships=tuple(relationships),
        )

    # --- internals ---------------------------------------------------

    def _build_graph_facts(
        self,
        *,
        entities: Sequence[GraphEntity],
        relationships: Sequence[GraphRelationship],
    ) -> list[GraphFact]:
        """Pair each relationship with its two endpoint entities.

        The pairing is a single dict lookup; a
        relationship whose endpoint is not in
        the ``entities`` set is dropped (the
        caller passed a subset, not the full
        graph). This is the same filter the
        :class:`GraphRetrievalService` already
        applies at the search level.
        """
        by_id = {e.id: e for e in entities}
        facts: list[GraphFact] = []
        for rel in relationships:
            src = by_id.get(rel.source_entity_id)
            tgt = by_id.get(rel.target_entity_id)
            if src is None or tgt is None:
                continue
            facts.append(GraphFact(source=src, target=tgt, relationship=rel))
        return facts

    def _score_with_boost(
        self,
        chunk: VectorChunk,
        entity_names: set[str],
    ) -> float:
        """Apply the graph-priority boost to a chunk's score.

        The boost is a small additive contribution
        based on how many distinct graph entity
        names appear in the chunk's content. The
        contribution is bounded so a chunk that
        happens to mention every entity in the
        graph does not score arbitrarily high.
        """
        if not entity_names:
            return chunk.score
        content_lower = chunk.content.lower()
        matches = sum(1 for name in entity_names if name in content_lower)
        if matches == 0:
            return chunk.score
        # Diminishing returns: each match adds
        # less than the previous one. The first
        # match contributes the full boost;
        # subsequent matches contribute
        # 1/2, 1/3, ... of it.
        boost = self._graph_boost * sum(1.0 / i for i in range(1, matches + 1))
        return chunk.score + boost

    @staticmethod
    def _content_key(content: str) -> str:
        """Stable hash of a chunk's content for dedup."""
        return hashlib.sha1(content.encode("utf-8")).hexdigest()


__all__ = [
    "FusedContext",
    "GraphFact",
    "GraphVectorFusionService",
    "RerankerPort",
    "VectorChunk",
]
