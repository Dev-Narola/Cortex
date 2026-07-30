"""
Graph context builder (V7 — Phase 9).

Converts graph data (entities + relationships)
and vector chunks into a single LLM-ready
string. The builder is the only place the
prompt text is shaped; the
:class:`GraphVectorFusionService` delegates
rendering here so the rules live in one file.

The output shape follows the spec:

    Relevant knowledge:
    - Cortex uses FastAPI.
    - Cortex uses PostgreSQL.
    - Cortex depends on Redis.

    Retrieved document excerpts:
    <vector hit 1>
    ...
    <vector hit N>

The graph facts are rendered first ("prioritise
graph facts over inferred facts"). The builder
is deliberately small: no markdown, no fancy
templates — the LLM is a text model and a clean
bullet list is the most reliable input.
"""

from __future__ import annotations

from typing import Any

from src.graph_retrieval.application.fusion import GraphFact, VectorChunk
from src.knowledge_graph.domain.value_objects import (
    EntityType,
    RelationshipType,
)


class GraphContextBuilder:
    """Render graph facts and vector chunks into an LLM-ready string.

    The builder is *stateful* on configuration
    only — the runtime data is passed per-call.
    The class is split from the fusion service
    so the rendering rules (sentence templates,
    section headers) can be tested in isolation
    and reused outside the fusion flow (e.g. a
    debug endpoint that renders a graph as
    Markdown).

    Parameters
    ----------
    graph_boost
        Stored for the future "mark the boosted
        graph facts in the output" feature. The
        current rendering is identical for
        boosted and un-boosted facts; the field
        is on the surface so callers can opt
        into the marker without a constructor
        change.
    include_descriptions
        When ``True`` (default) the entity
        description (if any) is rendered in
        parentheses after the entity name.
        When ``False`` only the name and
        relationship label are rendered. The
        flag is here so a future
        context-window-tight setting can drop
        the description cheaply.
    """

    def __init__(
        self,
        *,
        graph_boost: float = 1.5,
        include_descriptions: bool = True,
        max_chars_per_chunk: int = 800,
    ) -> None:
        if max_chars_per_chunk < 80:
            # A floor of 80 chars is the smallest
            # chunk we will render — below that
            # the chunk is not useful and we
            # drop it entirely.
            max_chars_per_chunk = 80
        self._graph_boost = float(graph_boost)
        self._include_descriptions = bool(include_descriptions)
        self._max_chars_per_chunk = int(max_chars_per_chunk)

    # --- public surface ---------------------------------------------

    def render(
        self,
        *,
        query: str,
        graph_facts: list[GraphFact],
        chunks: list[VectorChunk],
    ) -> str:
        """Render the fused context as a single string.

        The output is what the LLM prompt
        includes directly. The function is
        pure: same inputs → same output.
        """
        sections: list[str] = []
        # Section 1: the query (so the LLM has
        # it in context when re-attending the
        # rest of the prompt).
        if query:
            sections.append(f"Question: {query.strip()}")
        # Section 2: graph facts.
        rendered_facts = self._render_graph_facts(graph_facts)
        if rendered_facts:
            sections.append(
                "Relevant knowledge (from the knowledge graph):\n"
                + "\n".join(f"- {line}" for line in rendered_facts)
            )
        # Section 3: vector chunks.
        rendered_chunks = self._render_chunks(chunks)
        if rendered_chunks:
            sections.append(
                "Retrieved document excerpts:\n"
                + "\n\n".join(rendered_chunks)
            )
        return "\n\n".join(sections)

    # --- internals ---------------------------------------------------

    def _render_graph_facts(
        self, facts: list[GraphFact]
    ) -> list[str]:
        """Render a list of graph facts as one-line bullet sentences.

        The sentence template is::

            <source> <RELATIONSHIP> <target>

        with the source/target decorated by their
        entity type when it adds signal. The
        description is appended in parentheses
        when ``include_descriptions`` is true.
        """
        out: list[str] = []
        for fact in facts:
            src_label = self._label_entity(fact.source)
            tgt_label = self._label_entity(fact.target)
            rel_label = self._label_relationship(fact.relationship.relationship_type)
            line = f"{src_label} {rel_label} {tgt_label}"
            extras: list[str] = []
            if self._include_descriptions:
                if fact.relationship.confidence < 1.0:
                    extras.append(f"confidence {fact.relationship.confidence:.2f}")
                if fact.relationship.properties:
                    # Render the first non-empty
                    # string property as a hint;
                    # the LLM can ask for more.
                    for k, v in fact.relationship.properties.items():
                        if isinstance(v, str) and v.strip():
                            extras.append(f"{k}={v}")
                            break
            if extras:
                line = f"{line} ({', '.join(extras)})"
            out.append(line)
        # Stable order: sort by the sentence
        # text so two renders with the same
        # facts produce the same output
        # (the LLM cache is friendlier with
        # stable inputs).
        out.sort()
        return out

    def _label_entity(self, entity: Any) -> str:
        """Render an entity as a short human-readable label.

        The label is ``"Name (TYPE)"`` when the
        entity type adds signal (i.e. not
        ``CONCEPT``, which is the default), and
        just ``"Name"`` otherwise.
        """
        name = entity.name
        if (
            self._include_descriptions
            and entity.entity_type != EntityType.CONCEPT
        ):
            return f"{name} ({entity.entity_type.value})"
        return name

    def _label_relationship(self, rel_type: Any) -> str:
        """Render a relationship label as a verb-like phrase.

        The label is the enum's *value* in
        upper-case — the LLM is used to reading
        ``USES``, ``CREATED``, etc. The mapping
        is a single ``.value.upper()`` so a
        future enum addition is a no-op.
        """
        if isinstance(rel_type, RelationshipType):
            return rel_type.value.upper()
        return str(rel_type).upper()

    def _render_chunks(
        self, chunks: list[VectorChunk]
    ) -> list[str]:
        """Render each chunk as a short block, truncated to the cap."""
        out: list[str] = []
        for idx, chunk in enumerate(chunks, start=1):
            content = (chunk.content or "").strip()
            if not content:
                continue
            if len(content) > self._max_chars_per_chunk:
                content = content[: self._max_chars_per_chunk].rstrip() + "..."
            out.append(f"[{idx}] {content}")
        return out


__all__ = ["GraphContextBuilder"]
