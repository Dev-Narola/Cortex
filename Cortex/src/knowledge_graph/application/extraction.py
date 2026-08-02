"""
LLM-driven entity and relationship extraction for the
knowledge-graph bounded context.

This module turns a chunk of natural-language text into
graph data. The flow is the spec's pipeline:

    Chunk
       |
       v
    EntityExtractionService.extract_entities(text)
       |  -- one LLM call: "give me the entities in this text"
       v
    list[GraphEntity]
       |
       v
    RelationshipExtractionService.extract_relationships(text, entities)
       |  -- one LLM call: "given the entities, what edges exist?"
       v
    list[GraphRelationship]

The two services are split (rather than combined) for two
reasons:

* the entity call is the expensive one — it produces
  names and types. Running it once per chunk and then
  asking the relationship extractor to *only* connect the
  entities it saw is much cheaper than asking for both in
  a single call and re-validating the output;
* the merge / dedup step (:class:`GraphExtractionPipeline`)
  can call the two services independently on different
  chunks and aggregate the results.

The ``ExtractionProvider`` seam is the *LLM* abstraction.
A future V9 hardening item can swap the OpenAI adapter
for an Anthropic one or a local model by adding a
subclass — the services themselves stay unchanged.

A small, fully-deterministic ``RuleBasedExtractionProvider``
is shipped in this module too: it does NOT need an LLM
and is what the unit tests use. It is *not* a production
replacement for the LLM; it is here so the rest of the
codebase (the pipeline, the dedup logic, the persistence
flow) can be exercised without a network call.
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from abc import ABC, abstractmethod
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from src.agents.infrastructure.llm_provider import LLMProvider, LLMResult
from src.core.config import settings
from src.knowledge_graph.domain.entities import GraphEntity, GraphRelationship
from src.knowledge_graph.domain.exceptions import GraphExtractionFailed
from src.knowledge_graph.domain.value_objects import EntityType, RelationshipType
from src.shared.exceptions import ValidationException

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------


# A small, conservative stop-word list. We keep it short
# because a real extraction run hands the chunk to the LLM
# and the LLM is the one filtering; this list is the safety
# net for the rule-based fallback and for the post-LLM
# normalisation step.
DEFAULT_STOP_WORDS: frozenset[str] = frozenset(
    {
        "a", "an", "and", "are", "as", "at", "be", "by", "for",
        "from", "has", "have", "in", "is", "it", "its", "of",
        "on", "or", "that", "the", "this", "to", "was", "were",
        "will", "with", "we", "you", "your", "our", "they",
        "them", "i", "me", "my", "he", "she", "his", "her",
        "but", "not", "no", "so", "if", "then", "than", "also",
    }
)


# Mapping from LLM-produced ``entity_type`` strings back to
# the closed enum. The LLM is told to use these exact
# strings in the system prompt; this map is a defensive
# fallback for the day a model produces a synonym.
_TYPE_HINTS: dict[str, EntityType] = {
    "person": EntityType.PERSON,
    "people": EntityType.PERSON,
    "human": EntityType.PERSON,
    "organization": EntityType.ORGANIZATION,
    "organisation": EntityType.ORGANIZATION,
    "company": EntityType.ORGANIZATION,
    "tech": EntityType.TECHNOLOGY,
    "technology": EntityType.TECHNOLOGY,
    "tool": EntityType.TECHNOLOGY,
    "library": EntityType.TECHNOLOGY,
    "framework": EntityType.TECHNOLOGY,
    "language": EntityType.TECHNOLOGY,
    "project": EntityType.PROJECT,
    "product": EntityType.PRODUCT,
    "location": EntityType.LOCATION,
    "place": EntityType.LOCATION,
    "concept": EntityType.CONCEPT,
    "idea": EntityType.CONCEPT,
    "document": EntityType.DOCUMENT,
    "file": EntityType.DOCUMENT,
}


# Same trick for relationship labels. The LLM is told to
# stick to the seven closed values; this map is for the
# day it produces a synonym.
_REL_HINTS: dict[str, RelationshipType] = {
    "created": RelationshipType.CREATED,
    "creates": RelationshipType.CREATED,
    "builds": RelationshipType.CREATED,
    "uses": RelationshipType.USES,
    "uses_by": RelationshipType.USES,
    "owns": RelationshipType.OWNS,
    "owned_by": RelationshipType.OWNS,
    "depends_on": RelationshipType.DEPENDS_ON,
    "depends": RelationshipType.DEPENDS_ON,
    "located_in": RelationshipType.LOCATED_IN,
    "in": RelationshipType.LOCATED_IN,
    "works_on": RelationshipType.WORKS_ON,
    "works": RelationshipType.WORKS_ON,
    "related_to": RelationshipType.RELATED_TO,
    "related": RelationshipType.RELATED_TO,
}


# Default threshold below which a relationship is dropped.
# The spec calls for 0.80; the constant lives here so a
# future "strict / relaxed" toggle can read it from
# settings.
DEFAULT_RELATIONSHIP_CONFIDENCE_THRESHOLD: float = 0.80


# ---------------------------------------------------------------------------
# Provider seam
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class EntityCandidate:
    """A single entity candidate from the LLM (or rule-based fallback)."""

    name: str
    entity_type: str
    description: str = ""


@dataclass(frozen=True, slots=True)
class RelationshipCandidate:
    """A single relationship candidate from the LLM (or rule-based fallback)."""

    source_name: str
    target_name: str
    relationship_type: str
    confidence: float = 1.0


class ExtractionProvider(ABC):
    """The seam between the extraction services and any LLM backend.

    Two methods, deliberately:

    * :meth:`extract_entities` — return the entities the
      model saw in the text.
    * :meth:`extract_relationships` — return the edges the
      model sees, given the entities the first call
      produced.

    Implementations are free to make one or two LLM calls
    per method. The production adapter uses
    :class:`src.agents.infrastructure.llm_provider.LLMProvider`
    with a JSON-mode system prompt; the
    :class:`RuleBasedExtractionProvider` is a deterministic
    offline fallback for tests.
    """

    @abstractmethod
    async def extract_entities(
        self, text: str
    ) -> list[EntityCandidate]:
        """Return the entities the model saw in ``text``."""

    @abstractmethod
    async def extract_relationships(
        self,
        text: str,
        entities: Sequence[EntityCandidate],
    ) -> list[RelationshipCandidate]:
        """Return the edges the model sees between the given entities."""


# ---------------------------------------------------------------------------
# OpenAI adapter
# ---------------------------------------------------------------------------


class OpenAIExtractionProvider(ExtractionProvider):
    """An LLM-backed implementation that uses the project's :class:`LLMProvider`.

    Two calls per chunk:

    * the entity call (JSON mode) returns a list of
      ``{name, entity_type, description}`` dicts;
    * the relationship call returns a list of
      ``{source_name, target_name, relationship_type, confidence}`` dicts.

    The two calls share a single model name
    (``settings.OPENAI_MODEL``) and a low temperature
    (0.0) — the spec calls for a deterministic
    extraction so the same chunk produces the same
    graph on every run. The temperature setting lives
    in the :class:`LLMProvider.generate` call so a
    future V9 tuning can override it per call.
    """

    SYSTEM_ENTITY = (
        "You are a precise entity extractor for a knowledge graph. "
        "Given a chunk of text, return ONLY a JSON object of the form "
        "{\"entities\": [{\"name\": \"...\", \"entity_type\": \"...\", "
        "\"description\": \"...\"}, ...]}. The entity_type must be one "
        f"of: {', '.join(t.value for t in EntityType)}. "
        "Ignore stop words, punctuation, and generic verbs. "
        "Do not invent entities that do not appear in the text. "
        "If the chunk has no entities, return {\"entities\": []}."
    )

    SYSTEM_RELATION = (
        "You are a precise relation extractor for a knowledge graph. "
        "Given a chunk of text and a list of entities that appear in it, "
        "return ONLY a JSON object of the form "
        "{\"relationships\": [{\"source_name\": \"...\", "
        "\"target_name\": \"...\", \"relationship_type\": \"...\", "
        "\"confidence\": 0.0}, ...]}. The relationship_type must be one "
        f"of: {', '.join(t.value for t in RelationshipType)}. "
        "confidence is between 0.0 and 1.0. "
        "If no relationships are present, return {\"relationships\": []}."
    )

    def __init__(self, llm: LLMProvider | None = None) -> None:
        # Lazy: tests pass a stub LLM, production uses
        # the singleton from ``get_llm_provider``.
        self._llm = llm

    async def extract_entities(
        self, text: str
    ) -> list[EntityCandidate]:
        llm = self._llm or _default_llm()
        result = await llm.generate(
            model=settings.OPENAI_MODEL,
            system=self.SYSTEM_ENTITY,
            messages=[{"role": "user", "content": text}],
            temperature=0.0,
            max_tokens=1024,
        )
        return _parse_entity_payload(result.output, context="entity")

    async def extract_relationships(
        self,
        text: str,
        entities: Sequence[EntityCandidate],
    ) -> list[RelationshipCandidate]:
        if not entities:
            return []
        llm = self._llm or _default_llm()
        entity_list = ", ".join(e.name for e in entities)
        user = (
            f"Text: {text}\n\n"
            f"Entities present: {entity_list}\n\n"
            "Return the relationships between these entities "
            "that the text asserts."
        )
        result = await llm.generate(
            model=settings.OPENAI_MODEL,
            system=self.SYSTEM_RELATION,
            messages=[{"role": "user", "content": user}],
            temperature=0.0,
            max_tokens=1024,
        )
        return _parse_relationship_payload(
            result.output, context="relationship"
        )


def _default_llm() -> LLMProvider:
    """Resolve the default LLM provider lazily.

    Importing :mod:`src.agents.infrastructure.llm_provider`
    at module load would force every test that imports
    this module to also load the OpenAI SDK; the lazy
    import keeps tests that use the rule-based fallback
    SDK-free.
    """
    from src.agents.infrastructure.llm_provider import OpenAILLMProvider

    return OpenAILLMProvider()


# ---------------------------------------------------------------------------
# JSON payload parsing
# ---------------------------------------------------------------------------


def _parse_entity_payload(
    raw: str, *, context: str
) -> list[EntityCandidate]:
    """Parse the LLM's JSON output into :class:`EntityCandidate` list.

    The LLM is told to return ``{"entities": [...]}`` but
    in practice models occasionally return a bare list or
    wrap the JSON in prose / markdown fences. The parser
    tries the strict shape first, then falls back to
    "find the first JSON object or list in the string".
    """
    payload = _coerce_json(raw)
    if not isinstance(payload, dict):
        raise GraphExtractionFailed(
            message=f"{context}: expected a JSON object at the top level",
            code=500,
            data={"raw_head": (raw or "")[:200]},
        )
    items = payload.get("entities")
    if not isinstance(items, list):
        raise GraphExtractionFailed(
            message=f"{context}: missing 'entities' array",
            code=500,
            data={"raw_head": (raw or "")[:200]},
        )
    out: list[EntityCandidate] = []
    for idx, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        name = (item.get("name") or "").strip()
        etype = (item.get("entity_type") or "").strip().lower()
        description = (item.get("description") or "").strip()
        if not name:
            continue
        out.append(
            EntityCandidate(
                name=name, entity_type=etype, description=description
            )
        )
    return out


def _parse_relationship_payload(
    raw: str, *, context: str
) -> list[RelationshipCandidate]:
    payload = _coerce_json(raw)
    if not isinstance(payload, dict):
        raise GraphExtractionFailed(
            message=f"{context}: expected a JSON object at the top level",
            code=500,
            data={"raw_head": (raw or "")[:200]},
        )
    items = payload.get("relationships")
    if not isinstance(items, list):
        raise GraphExtractionFailed(
            message=f"{context}: missing 'relationships' array",
            code=500,
            data={"raw_head": (raw or "")[:200]},
        )
    out: list[RelationshipCandidate] = []
    for idx, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        src = (item.get("source_name") or "").strip()
        tgt = (item.get("target_name") or "").strip()
        rtype = (item.get("relationship_type") or "").strip().lower()
        try:
            conf = float(item.get("confidence", 0.0) or 0.0)
        except (TypeError, ValueError):
            conf = 0.0
        if not src or not tgt or not rtype:
            continue
        out.append(
            RelationshipCandidate(
                source_name=src,
                target_name=tgt,
                relationship_type=rtype,
                confidence=conf,
            )
        )
    return out


def _coerce_json(raw: str) -> Any:
    """Best-effort JSON parse.

    Tries a strict ``json.loads`` first; if that fails,
    finds the first ``{...}`` or ``[...]`` substring and
    tries again. Returns ``None`` if neither works — the
    caller raises :class:`GraphExtractionFailed`.
    """
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        pass
    # Strip common markdown fences.
    text = raw.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```\s*$", "", text)
    try:
        return json.loads(text)
    except (TypeError, ValueError):
        pass
    # Hunt for the first balanced JSON object or array.
    for opener, closer in (("{", "}"), ("[", "]")):
        start = text.find(opener)
        if start == -1:
            continue
        depth = 0
        for end in range(start, len(text)):
            ch = text[end]
            if ch == opener:
                depth += 1
            elif ch == closer:
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(text[start : end + 1])
                    except (TypeError, ValueError):
                        break
    return None


# ---------------------------------------------------------------------------
# Normalisation helpers
# ---------------------------------------------------------------------------


def normalise_name(name: str) -> str:
    """Normalise a candidate entity name.

    The rules are deliberately conservative:

    * strip leading / trailing whitespace;
    * drop enclosing punctuation ``( ) [ ] { } " '`` ;
    * collapse internal whitespace runs.

    Capitalisation is preserved — the LLM is the source
    of truth for whether "FastAPI" is a brand name or
    "fastapi" is a project. Lowercasing here would
    silently lose signal.
    """
    if not name:
        return ""
    out = name.strip()
    while out and out[0] in "([{\"'":
        out = out[1:]
    while out and out[-1] in ")]}\"',.;:?":
        out = out[:-1]
    out = re.sub(r"\s+", " ", out)
    return out.strip()


def resolve_entity_type(hint: str) -> EntityType | None:
    """Map a (possibly noisy) LLM-produced type string to the closed enum."""
    key = (hint or "").strip().lower()
    if not key:
        return None
    if key in _TYPE_HINTS:
        return _TYPE_HINTS[key]
    try:
        return EntityType(key)
    except ValueError:
        return None


def resolve_relationship_type(hint: str) -> RelationshipType | None:
    """Map a (possibly noisy) LLM-produced relationship label to the enum."""
    key = (hint or "").strip().lower()
    if not key:
        return None
    if key in _REL_HINTS:
        return _REL_HINTS[key]
    try:
        return RelationshipType(key)
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Services
# ---------------------------------------------------------------------------


class EntityExtractionService:
    """Turn a chunk of text into a list of :class:`GraphEntity` candidates.

    The service is *stateless* and *side-effect-free*: the
    pipeline calls it, takes the returned candidates, and
    is responsible for persisting them. The split keeps
    the service trivially testable.

    Validation rules:

    * the chunk must be non-empty;
    * stop words are removed;
    * names are normalised (whitespace, enclosing
      punctuation);
    * duplicate names within the chunk collapse to a
      single candidate (the LLM sometimes re-uses a name
      twice);
    * unknown ``entity_type`` values fall back to
      :class:`EntityType.CONCEPT` rather than raising —
      the LLM is the source of truth and "concept" is the
      safe default.
    """

    def __init__(
        self,
        provider: ExtractionProvider,
        *,
        stop_words: frozenset[str] = DEFAULT_STOP_WORDS,
    ) -> None:
        self._provider = provider
        self._stop = frozenset(w.lower() for w in stop_words)

    async def extract_entities(
        self,
        text: str,
        *,
        tenant_id: uuid.UUID,
    ) -> list[GraphEntity]:
        """Run the entity extraction and return validated :class:`GraphEntity` candidates.

        The returned entities are *not* persisted — the
        pipeline is responsible for that. The candidates
        are valid :class:`GraphEntity` instances because
        the constructor is the only safe way to allocate
        one; the pipeline can hand them straight to the
        repository's ``create`` method.
        """
        if not isinstance(text, str) or not text.strip():
            raise ValidationException(
                message="text must be a non-empty string",
                code=400,
                data={"field": "text"},
            )
        if not isinstance(tenant_id, uuid.UUID):
            raise ValidationException(
                message="tenant_id must be a UUID",
                code=400,
                data={"field": "tenant_id"},
            )

        try:
            candidates = await self._provider.extract_entities(text)
        except GraphExtractionFailed:
            raise
        except Exception as exc:  # noqa: BLE001 - any provider failure is an extraction failure
            raise GraphExtractionFailed(
                message="entity extraction provider failed",
                code=500,
                data={"error": str(exc)},
            ) from exc

        return self._build_entities(candidates, tenant_id=tenant_id)

    # --- internals -----------------------------------------------------

    def _build_entities(
        self,
        candidates: Sequence[EntityCandidate],
        *,
        tenant_id: uuid.UUID,
    ) -> list[GraphEntity]:
        """Validate, dedupe, and materialise the candidates.

        The dedup key is the *normalised* name — two
        candidates that differ only in whitespace / case
        collapse to one. The LLM is told to be consistent
        but the safety net is here.
        """
        seen: dict[str, GraphEntity] = {}
        for cand in candidates:
            name = normalise_name(cand.name)
            if not name:
                continue
            if name.lower() in self._stop:
                continue
            etype = resolve_entity_type(cand.entity_type) or EntityType.CONCEPT
            key = name.lower()
            if key in seen:
                # Keep the first one — the LLM shouldn't
                # have produced two, but if it did, the
                # first wins.
                continue
            seen[key] = GraphEntity.create(
                tenant_id=tenant_id,
                name=name,
                entity_type=etype,
                description=(cand.description or "")[:500],
            )
        # Stable order by name for predictable tests.
        return [seen[k] for k in sorted(seen)]


class RelationshipExtractionService:
    """Turn a chunk + entity list into :class:`GraphRelationship` candidates.

    The service is the spec's relationship extractor:

    * it sends the chunk and the entity list to the
      :class:`ExtractionProvider` (which is an LLM call in
      production, a deterministic rule in tests);
    * the provider's response is normalised — unknown
      labels fall back to :class:`RelationshipType.RELATED_TO`
      rather than raising;
    * relationships below the confidence threshold
      (default 0.80, per the spec) are dropped;
    * self-loops are dropped — the :class:`GraphRelationship`
      constructor rejects them anyway, but we want a
      clean list before we get there;
    * the returned list is sorted by ``(source_name,
      target_name, relationship_type)`` for deterministic
      persistence.
    """

    def __init__(
        self,
        provider: ExtractionProvider,
        *,
        confidence_threshold: float = DEFAULT_RELATIONSHIP_CONFIDENCE_THRESHOLD,
    ) -> None:
        self._provider = provider
        self._threshold = float(confidence_threshold)

    async def extract_relationships(
        self,
        text: str,
        entities: Sequence[GraphEntity],
    ) -> list[GraphRelationship]:
        """Run the relationship extraction and return validated candidates.

        The returned relationships are *not* persisted.
        Each :class:`GraphRelationship` carries the
        tenant id from the supplied entities — the
        pipeline's dedup pass is responsible for mapping
        ``source_name`` / ``target_name`` strings back to
        :class:`GraphEntity` ids.
        """
        if not isinstance(text, str) or not text.strip():
            raise ValidationException(
                message="text must be a non-empty string",
                code=400,
                data={"field": "text"},
            )
        if not entities:
            return []
        if any(e.tenant_id != entities[0].tenant_id for e in entities):
            raise ValidationException(
                message="all entities must belong to the same tenant",
                code=400,
                data={"field": "entities"},
            )
        tenant_id = entities[0].tenant_id

        # We pass the entity *names* to the LLM, not the
        # domain entities — the LLM is the one writing
        # the response in terms of names, and converting
        # back to ids happens at persistence time.
        name_to_entity = {e.name: e for e in entities}
        candidates_input = [
            EntityCandidate(name=e.name, entity_type=e.entity_type.value)
            for e in entities
        ]
        try:
            candidates = await self._provider.extract_relationships(
                text, candidates_input
            )
        except GraphExtractionFailed:
            raise
        except Exception as exc:  # noqa: BLE001
            raise GraphExtractionFailed(
                message="relationship extraction provider failed",
                code=500,
                data={"error": str(exc)},
            ) from exc

        return self._build_relationships(
            candidates,
            tenant_id=tenant_id,
            name_to_entity=name_to_entity,
        )

    def _build_relationships(
        self,
        candidates: Sequence[RelationshipCandidate],
        *,
        tenant_id: uuid.UUID,
        name_to_entity: dict[str, GraphEntity],
    ) -> list[GraphRelationship]:
        """Validate, threshold, and materialise the candidates.

        A candidate is dropped if:

        * its source or target is not in the
          ``name_to_entity`` map (the LLM invented a name
          not present in the entity list);
        * its confidence is below the threshold;
        * the resolved relationship label is not a
          closed-enum value;
        * source and target resolve to the same entity
          (self-loops are forbidden).
        """
        out: list[GraphRelationship] = []
        for cand in candidates:
            src_name = normalise_name(cand.source_name)
            tgt_name = normalise_name(cand.target_name)
            src = name_to_entity.get(src_name)
            tgt = name_to_entity.get(tgt_name)
            if src is None or tgt is None:
                continue
            if src.id == tgt.id:
                continue
            if cand.confidence < self._threshold:
                continue
            rtype = resolve_relationship_type(cand.relationship_type)
            if rtype is None:
                rtype = RelationshipType.RELATED_TO
            try:
                rel = GraphRelationship.create(
                    tenant_id=tenant_id,
                    source_entity_id=src.id,
                    target_entity_id=tgt.id,
                    relationship_type=rtype,
                    confidence=cand.confidence,
                )
            except ValidationException:
                # Defensive: ``GraphRelationship.create``
                # raises on self-loops, bad confidence,
                # etc. The pipeline would rather lose a
                # bad edge than fail the whole extraction.
                continue
            out.append(rel)
        # Stable order for deterministic persistence.
        out.sort(
            key=lambda r: (
                str(r.source_entity_id),
                str(r.target_entity_id),
                r.relationship_type.value,
            )
        )
        return out


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------


@dataclass
class ExtractionMetrics:
    """Per-document extraction metrics, surfaced via the V4 metrics layer."""

    chunks_processed: int = 0
    entities_extracted: int = 0
    entities_deduped: int = 0
    relationships_extracted: int = 0
    relationships_deduped: int = 0
    relationships_filtered_by_confidence: int = 0
    failed_chunks: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0

    def as_dict(self) -> dict[str, int]:
        return {
            "chunks_processed": self.chunks_processed,
            "entities_extracted": self.entities_extracted,
            "entities_deduped": self.entities_deduped,
            "relationships_extracted": self.relationships_extracted,
            "relationships_deduped": self.relationships_deduped,
            "relationships_filtered_by_confidence": (
                self.relationships_filtered_by_confidence
            ),
            "failed_chunks": self.failed_chunks,
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
        }


@dataclass
class ExtractionResult:
    """The pipeline's final result for one document.

    The persisted graph is the source of truth; this
    dataclass is a *summary* the REST handler returns to
    the caller (so the UI can show "extracted 12 entities,
    7 relationships, 1 failed chunk").
    """

    document_id: uuid.UUID
    tenant_id: uuid.UUID
    entities: list[GraphEntity] = field(default_factory=list)
    relationships: list[GraphRelationship] = field(default_factory=list)
    metrics: ExtractionMetrics = field(default_factory=ExtractionMetrics)


class GraphExtractionPipeline:
    """The end-to-end pipeline that turns a document into a graph.

    Flow:

    1. Load the document's chunks (the chunker is the
       V2 ingest pipeline; this pipeline trusts the
       ``DocumentChunkModel`` rows already in the DB).
    2. For each chunk:
       * call :class:`EntityExtractionService`;
       * call :class:`RelationshipExtractionService`;
       * accumulate the candidates in memory.
    3. Dedup entities by ``(name, entity_type)`` across
       chunks: the first occurrence wins; later ones are
       folded into a single row. The merge sets
       ``canonical_id`` on the *later* row so the graph UI
       can render the merge trail.
    4. Persist entities (or reuse existing rows by
       ``(name, entity_type)``). The repository's
       :meth:`create` raises :class:`ConflictException` on
       a hard duplicate; the pipeline catches and looks
       up the existing row by ``get_by_name`` instead.
    5. Persist relationships. The
       :class:`ConflictException` 409 path is the same
       as the entity one — the pipeline catches and
       silently drops the duplicate.
    6. Update the V4 metrics layer with the per-document
       counters and the per-tenant token counters.

    The pipeline is intentionally synchronous in its
    outer shape (the LLM calls are awaited inside the
    services). The REST handler can ``await`` the
    pipeline directly.
    """

    def __init__(
        self,
        db: Any,
        entity_service: EntityExtractionService,
        relationship_service: RelationshipExtractionService,
        *,
        confidence_threshold: float = (
            DEFAULT_RELATIONSHIP_CONFIDENCE_THRESHOLD
        ),
    ) -> None:
        # ``db`` is a SQLAlchemy ``Session`` typed as ``Any``
        # to keep the application layer's import surface
        # small. The repositories know the real type.
        self._db = db
        self._entity_service = entity_service
        self._relationship_service = relationship_service
        self._threshold = float(confidence_threshold)

    async def extract_for_document(
        self,
        *,
        tenant_id: uuid.UUID,
        document_id: uuid.UUID,
    ) -> ExtractionResult:
        """Run the extraction for a single document.

        Chunks are loaded via the SQLAlchemy session
        directly (not a repository) because the
        ``DocumentChunkModel`` is a cross-context table
        and the pipeline is the only V7 entry point that
        reads it; standing up a separate repository for
        one query would be over-engineering.
        """
        from src.ingestion.infrastructure.models import (
            DocumentChunkModel,
        )

        if not isinstance(tenant_id, uuid.UUID):
            raise ValidationException(
                message="tenant_id must be a UUID",
                code=400,
                data={"field": "tenant_id"},
            )
        if not isinstance(document_id, uuid.UUID):
            raise ValidationException(
                message="document_id must be a UUID",
                code=400,
                data={"field": "document_id"},
            )

        chunks = (
            self._db.query(DocumentChunkModel)
            .filter(
                DocumentChunkModel.tenant_id == tenant_id,
                DocumentChunkModel.document_id == document_id,
            )
            .order_by(DocumentChunkModel.chunk_index.asc())
            .all()
        )

        result = ExtractionResult(document_id=document_id, tenant_id=tenant_id)

        # ``by_name`` maps a normalised entity name to
        # the *persisted* :class:`GraphEntity` we used.
        # When the next chunk produces the same name we
        # reuse the existing row instead of creating a
        # duplicate. The :class:`GraphEntity` instance
        # is the domain object, not the ORM model.
        by_name: dict[tuple[str, str], GraphEntity] = {}

        from src.knowledge_graph.infrastructure.repositories import (
            GraphEntityRepository,
            GraphRelationshipRepository,
        )

        entity_repo = GraphEntityRepository(self._db)
        rel_repo = GraphRelationshipRepository(self._db)

        for chunk in chunks:
            result.metrics.chunks_processed += 1
            chunk_entities: list[GraphEntity] = []
            try:
                chunk_entities = await self._entity_service.extract_entities(
                    chunk.content, tenant_id=tenant_id
                )
            except GraphExtractionFailed as exc:
                logger.warning(
                    "graph_extraction.entity_failed",
                    extra={
                        "document_id": str(document_id),
                        "chunk_id": str(chunk.id),
                        "error": exc.message,
                    },
                )
                result.metrics.failed_chunks += 1
                _record_failed_extraction()
                # Continue with the rest of the document;
                # a failed chunk does not abort extraction.
                continue

            # Persist (or reuse) each entity.
            for entity in chunk_entities:
                key = (entity.name.lower(), entity.entity_type.value)
                if key in by_name:
                    result.metrics.entities_deduped += 1
                    continue
                existing = entity_repo.get_by_name(
                    tenant_id=tenant_id,
                    name=entity.name,
                    entity_type=entity.entity_type,
                )
                if existing is not None:
                    by_name[key] = existing
                    result.metrics.entities_deduped += 1
                    continue
                try:
                    persisted = entity_repo.create(entity)
                except Exception:  # noqa: BLE001 - 409 path: race vs another extract
                    # A concurrent extraction for the
                    # same document may have inserted
                    # the row. Re-fetch and reuse.
                    self._db.rollback()
                    existing = entity_repo.get_by_name(
                        tenant_id=tenant_id,
                        name=entity.name,
                        entity_type=entity.entity_type,
                    )
                    if existing is None:
                        # Genuine failure — re-raise.
                        raise
                    by_name[key] = existing
                    result.metrics.entities_deduped += 1
                    continue
                by_name[key] = persisted
                result.entities.append(persisted)
                result.metrics.entities_extracted += 1
                _record_entity_extracted()

            # Relationships: ask the LLM about this
            # chunk's entities only.
            try:
                chunk_rels = (
                    await self._relationship_service.extract_relationships(
                        chunk.content, chunk_entities
                    )
                )
            except GraphExtractionFailed as exc:
                logger.warning(
                    "graph_extraction.relationship_failed",
                    extra={
                        "document_id": str(document_id),
                        "chunk_id": str(chunk.id),
                        "error": exc.message,
                    },
                )
                result.metrics.failed_chunks += 1
                _record_failed_extraction()
                continue

            for rel in chunk_rels:
                if rel.confidence < self._threshold:
                    result.metrics.relationships_filtered_by_confidence += 1
                    continue
                try:
                    persisted = rel_repo.create(rel)
                except Exception:  # noqa: BLE001 - 409 dup is the expected case
                    self._db.rollback()
                    result.metrics.relationships_deduped += 1
                    continue
                result.relationships.append(persisted)
                result.metrics.relationships_extracted += 1
                _record_relationship_extracted()

        # Commit the whole extraction in one
        # transaction; the per-chunk ``create`` calls
        # were individual ``add + flush`` operations
        # and the 409 path did a ``rollback`` that the
        # FastAPI dependency will unwind, but the
        # final commit is the pipeline's
        # responsibility because it's the one that
        # knows the run is done.
        try:
            self._db.commit()
        except Exception:  # noqa: BLE001
            self._db.rollback()
            raise

        _record_pipeline_complete(tenant_id=tenant_id)
        logger.info(
            "graph_extraction.document_complete",
            extra={
                "document_id": str(document_id),
                "tenant_id": str(tenant_id),
                **result.metrics.as_dict(),
            },
        )
        return result

    async def extract_from_text(
        self,
        *,
        text: str,
        tenant_id: uuid.UUID,
        document_id: uuid.UUID | None = None,
    ) -> dict[str, Any]:
        """Extract entities and relationships directly from a text block and persist them."""
        from src.knowledge_graph.infrastructure.repositories import (
            GraphEntityRepository,
            GraphRelationshipRepository,
        )

        entity_repo = GraphEntityRepository(self._db)
        rel_repo = GraphRelationshipRepository(self._db)

        doc_id = document_id or uuid.uuid4()
        entities = await self._entity_service.extract_entities(text, tenant_id=tenant_id)

        persisted_entities: list[GraphEntity] = []
        by_name: dict[tuple[str, str], GraphEntity] = {}

        for ent in entities:
            norm_key = (ent.name.lower(), ent.entity_type.value if hasattr(ent.entity_type, "value") else str(ent.entity_type))
            if norm_key in by_name:
                persisted_entities.append(by_name[norm_key])
                continue

            existing = entity_repo.get_by_name(tenant_id=tenant_id, name=ent.name, entity_type=ent.entity_type)
            if existing is not None:
                by_name[norm_key] = existing
                persisted_entities.append(existing)
            else:
                try:
                    created = entity_repo.create(ent)
                    by_name[norm_key] = created
                    persisted_entities.append(created)
                    _record_entity_extracted()
                except Exception:
                    # Duplicate or error
                    fetched = entity_repo.get_by_name(tenant_id=tenant_id, name=ent.name, entity_type=ent.entity_type)
                    if fetched is not None:
                        by_name[norm_key] = fetched
                        persisted_entities.append(fetched)

        rels = await self._relationship_service.extract_relationships(text, persisted_entities)
        persisted_rels: list[GraphRelationship] = []

        for rel in rels:
            if rel.confidence < self._threshold:
                continue
            try:
                created_rel = rel_repo.create(rel)
                persisted_rels.append(created_rel)
                _record_relationship_extracted()
            except Exception:
                pass

        try:
            self._db.commit()
        except Exception:
            self._db.rollback()
            raise

        return {
            "document_id": str(doc_id),
            "tenant_id": str(tenant_id),
            "entities_extracted": len(persisted_entities),
            "relationships_extracted": len(persisted_rels),
        }



# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------


def _safe_record(call: "Any") -> None:
    """Run a metrics callback, swallow any failure.

    Observability is best-effort: a missing Prometheus
    client or a closed registry must never break a
    request. The wrapper is a no-op when the metrics
    layer raises.
    """
    try:
        call()
    except Exception:  # noqa: BLE001
        return


def _record_entity_extracted() -> None:
    def _do() -> None:
        from src.observability.infrastructure.metrics import (
            KG_ENTITIES_EXTRACTED_TOTAL,
        )

        KG_ENTITIES_EXTRACTED_TOTAL.labels().inc()
    _safe_record(_do)


def _record_relationship_extracted() -> None:
    def _do() -> None:
        from src.observability.infrastructure.metrics import (
            KG_RELATIONSHIPS_EXTRACTED_TOTAL,
        )

        KG_RELATIONSHIPS_EXTRACTED_TOTAL.labels().inc()
    _safe_record(_do)


def _record_failed_extraction() -> None:
    def _do() -> None:
        from src.observability.infrastructure.metrics import (
            KG_EXTRACTION_FAILURES_TOTAL,
        )

        KG_EXTRACTION_FAILURES_TOTAL.labels().inc()
    _safe_record(_do)


def _record_pipeline_complete(*, tenant_id: uuid.UUID) -> None:
    """Bump the per-tenant extraction latency / counter.

    The ``tenant_id`` is intentionally *not* a label —
    cardinality discipline. The per-tenant counter is
    exposed in usage events, not in Prometheus.
    """
    def _do() -> None:
        from src.observability.infrastructure.metrics import (
            KG_PIPELINE_RUNS_TOTAL,
        )

        KG_PIPELINE_RUNS_TOTAL.labels().inc()
    _safe_record(_do)


# ---------------------------------------------------------------------------
# Rule-based fallback (tests + offline)
# ---------------------------------------------------------------------------


_CAPITALISED = re.compile(r"\b[A-Z][A-Za-z0-9.\-]+\b")


class RuleBasedExtractionProvider(ExtractionProvider):
    """A deterministic, LLM-free extraction provider.

    Useful for:

    * unit tests that want to assert the pipeline's
      dedup and persistence behaviour without paying
      for an LLM call;
    * a local development environment without an
      OpenAI key;
    * the smoke-test path that verifies the V7 wiring.

    The rules are deliberately minimal:

    * entities: a *capitalised* token is an entity;
    * relationship: every pair of entities in the
      same sentence is linked by :class:`RelationshipType.RELATED_TO`
      with a confidence that decays with the number of
      entities in the chunk (more entities ⇒ lower
      confidence per pair).

    This is **not** a production replacement for the
    LLM — the spec's value comes from the LLM. The
    rule-based provider is a stand-in.

    The async methods are kept on the surface (the
    interface is async) but the body has no
    ``await`` — callers inside a running event loop
    can ``await`` them, and sync callers can use
    the public ``_extract_candidates`` /
    ``_extract_relationship_candidates`` helpers to
    skip the coroutine wrapper.
    """

    def _extract_candidates(self, text: str) -> list[EntityCandidate]:
        """Sync body of :meth:`extract_entities`.

        Kept as a separate method so synchronous
        callers (e.g. tests inside a running event
        loop) can drive the rule-based path without
        ``asyncio.run`` deadlocking.
        """
        if not text:
            return []
        names: list[str] = []
        seen: set[str] = set()
        for match in _CAPITALISED.finditer(text):
            name = match.group(0).strip()
            if len(name) < 2:
                continue
            key = name.lower()
            if key in seen:
                continue
            seen.add(key)
            names.append(name)
        return [
            EntityCandidate(name=n, entity_type="concept")
            for n in names
        ]

    def _extract_relationship_candidates(
        self,
        text: str,
        entities: Sequence[EntityCandidate],
    ) -> list[RelationshipCandidate]:
        """Sync body of :meth:`extract_relationships`."""
        if not entities or not text:
            return []
        n = len(entities)
        confidence = max(0.0, 1.05 - 0.10 * n)
        out: list[RelationshipCandidate] = []
        for i in range(n):
            for j in range(n):
                if i == j:
                    continue
                out.append(
                    RelationshipCandidate(
                        source_name=entities[i].name,
                        target_name=entities[j].name,
                        relationship_type="related_to",
                        confidence=confidence,
                    )
                )
        return out

    async def extract_entities(
        self, text: str
    ) -> list[EntityCandidate]:
        return self._extract_candidates(text)

    async def extract_relationships(
        self,
        text: str,
        entities: Sequence[EntityCandidate],
    ) -> list[RelationshipCandidate]:
        return self._extract_relationship_candidates(text, entities)


__all__ = [
    "DEFAULT_RELATIONSHIP_CONFIDENCE_THRESHOLD",
    "DEFAULT_STOP_WORDS",
    "EntityCandidate",
    "EntityExtractionService",
    "ExtractionMetrics",
    "ExtractionProvider",
    "ExtractionResult",
    "GraphExtractionPipeline",
    "OpenAIExtractionProvider",
    "RelationshipCandidate",
    "RelationshipExtractionService",
    "RuleBasedExtractionProvider",
    "normalise_name",
    "resolve_entity_type",
    "resolve_relationship_type",
]
