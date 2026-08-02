"""
Domain entities for the knowledge-graph bounded context.

Per the project's hexagonal layout, no entity in this
file imports from FastAPI, SQLAlchemy, boto3, or any
infrastructure concern. The rules enforced here must
hold in unit tests exactly as they hold in production.

Two aggregates live in this module:

* :class:`GraphEntity` — a *node* in the graph. Real-world
  thing: a person, a company, a technology, etc.
* :class:`GraphRelationship` — an *edge*. A directed,
  typed connection between two entities.

The aggregates are 1:1 with the spec's two tables
(``kg_entities`` and ``kg_relations``). The split
mirrors the V1+V3 doc's design: nodes and edges are
separate aggregates because their lifecycles are
different (a node can outlive every relationship it
participates in; a relationship is meaningless without
both endpoints).

Design choices:

* **Frozen dataclass + factory.** ``GraphEntity.create``
  and :meth:`GraphRelationship.create` validate
  user-supplied input. ``from_persistence`` reconstructs
  the entity from the database and trusts the persisted
  state. The split mirrors the V1 identity / V6 agents
  pattern.
* **Tenant isolation is enforced at construction.** A
  ``GraphEntity`` cannot exist without a tenant id; a
  ``GraphRelationship`` carries its own tenant id
  (denormalised from the source entity) so a single
  index on ``kg_relations.tenant_id`` makes
  "list this tenant's edges" a constant-time read.
* **Confidence on relationships, not on entities.** An
  entity was extracted from a chunk with some
  confidence too, but that's the *extraction's*
  confidence, not the entity's. The relationship's
  confidence is the LLM's "how sure are you that this
  edge exists" — it lives on the edge because the
  edge is the assertion, not the node.
* **Properties is a free-form dict.** The extraction
  layer (LLM-driven) may add arbitrary keys
  (``wikipedia_url``, ``founded_year``); the schema
  doesn't pin them. The constraint is that the
  value must be JSON-serialisable so the column can
  be stored in JSONB.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime
from typing import Any, Self

from src.knowledge_graph.domain.value_objects import EntityType, RelationshipType
from src.shared.exceptions import ValidationException


# ---------------------------------------------------------------------------
# GraphEntity
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class GraphEntity:
    """A node in the tenant's knowledge graph.

    A :class:`GraphEntity` is the *assertion* that a
    real-world thing exists in the graph; the
    *extraction* that produced it is recorded via the
    ``source_chunk_id`` FK on the persistence layer
    (not on this entity — the entity is the
    persistent object, the extraction is the event).
    """

    # ----- identity --------------------------------------------------------

    id: uuid.UUID
    tenant_id: uuid.UUID

    # ----- timestamps -------------------------------------------------------

    # ``created_at`` and ``updated_at`` are declared
    # before the defaulted fields so the dataclass
    # accepts them (non-default fields must precede
    # defaulted ones). The factory in
    # :meth:`GraphEntity.create` always supplies
    # both, defaulting to ``datetime.now(UTC)`` when
    # the caller does not pass one.
    created_at: datetime
    updated_at: datetime

    # ----- content ----------------------------------------------------------

    # The entity's display name. Required, non-empty.
    # The repository enforces a uniqueness
    # constraint at the SQL layer (so a tenant
    # cannot have two "Acme Corp" entities with
    # different ids); the application service is
    # responsible for the *merge* step (via
    # ``canonical_id``) when two chunks extract the
    # same real-world thing under different names.
    name: str
    entity_type: EntityType
    # A short human-readable description. Optional;
    # the LLM-driven extractor produces one when
    # the source chunk contains enough context.
    description: str = ""
    # Free-form properties the extraction layer
    # decided to record. The schema does not pin
    # these — the constraint is that the value is
    # JSON-serialisable. Examples: ``{"wikipedia_url":
    # "..."}``, ``{"founded_year": 1998}``.
    properties: dict[str, Any] = field(default_factory=dict)

    # ----- factories --------------------------------------------------------

    @classmethod
    def create(
        cls,
        *,
        tenant_id: uuid.UUID,
        name: str,
        entity_type: EntityType | str,
        description: str = "",
        properties: dict[str, Any] | None = None,
        now: datetime | None = None,
    ) -> Self:
        """Validate and create a new entity.

        Business rules:

        * ``name`` is required and non-empty.
        * ``entity_type`` must be a known :class:`EntityType`.
        * ``properties`` must be JSON-serialisable.
        * ``tenant_id`` must be a real UUID — a
          missing or malformed tenant is a 400.
        """
        # --- name ---
        if not isinstance(name, str) or not name.strip():
            raise ValidationException(
                message="entity name is required",
                code=400,
                data={"field": "name"},
            )
        name = name.strip()
        if len(name) > 255:
            raise ValidationException(
                message="entity name is too long (max 255 characters)",
                code=400,
                data={"field": "name", "constraint": "len(name) <= 255"},
            )

        # --- entity_type ---
        if isinstance(entity_type, str):
            try:
                entity_type = EntityType(entity_type)
            except ValueError as exc:
                raise ValidationException(
                    message=f"unknown entity_type '{entity_type}'",
                    code=400,
                    data={
                        "field": "entity_type",
                        "value": str(entity_type),
                        "allowed": [t.value for t in EntityType],
                    },
                ) from exc

        # --- properties ---
        if properties is None:
            properties = {}
        if not isinstance(properties, dict):
            raise ValidationException(
                message="properties must be a dict",
                code=400,
                data={"field": "properties"},
            )
        # JSON-serialisability is the constraint: a
        # value that ``json.dumps`` cannot round-trip
        # without an adapter is not a valid property.
        # We deliberately do *not* pass ``default=...``
        # here — ``default=str`` would let any object
        # through (it would stringify the repr), which
        # is not what the spec means by "must be valid
        # JSON". The application stores the dict in a
        # JSONB column; the database would reject
        # anything ``json.dumps`` rejects too, but the
        # application-layer check is the faster
        # failure path.
        try:
            json.dumps(properties)
        except (TypeError, ValueError) as exc:
            raise ValidationException(
                message="properties must be JSON-serialisable",
                code=400,
                data={"field": "properties", "error": str(exc)},
            ) from exc

        # --- tenant_id ---
        if not isinstance(tenant_id, uuid.UUID):
            raise ValidationException(
                message="entity must belong to a tenant",
                code=400,
                data={"field": "tenant_id"},
            )

        now = now or datetime.now(UTC)
        return cls(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            name=name,
            entity_type=entity_type,
            description=description.strip(),
            properties=properties,
            created_at=now,
            updated_at=now,
        )

    @classmethod
    def from_persistence(
        cls,
        *,
        id: uuid.UUID,
        tenant_id: uuid.UUID,
        name: str,
        entity_type: str | EntityType,
        description: str,
        properties: dict[str, Any],
        created_at: datetime,
        updated_at: datetime,
    ) -> Self:
        """Reconstruct from the database; trusts the persisted state."""
        if isinstance(entity_type, str):
            entity_type = EntityType(entity_type)
        return cls(
            id=id,
            tenant_id=tenant_id,
            name=name,
            entity_type=entity_type,
            description=description,
            properties=properties,
            created_at=created_at,
            updated_at=updated_at,
        )

    # ----- content updates -------------------------------------------------

    def with_changes(
        self,
        *,
        name: str | None = None,
        description: str | None = None,
        properties: dict[str, Any] | None = None,
        now: datetime | None = None,
    ) -> Self:
        """Return a new instance with the given fields updated.

        ``entity_type`` is intentionally *not* in
        the update surface: changing a node's type
        after the fact is a destructive merge
        operation, not a normal edit. A V9 item
        can introduce a dedicated ``reclassify_node``
        service that handles the merge correctly.
        """
        if name is not None and not name.strip():
            raise ValidationException(
                message="entity name cannot be empty",
                code=400,
                data={"field": "name"},
            )
        if properties is not None:
            try:
                json.dumps(properties)
            except (TypeError, ValueError) as exc:
                raise ValidationException(
                    message="properties must be JSON-serialisable",
                    code=400,
                    data={"field": "properties", "error": str(exc)},
                ) from exc
        return replace(
            self,
            name=name.strip() if name is not None else self.name,
            description=description.strip() if description is not None else self.description,
            properties=properties if properties is not None else self.properties,
            updated_at=now or datetime.now(UTC),
        )


# ---------------------------------------------------------------------------
# GraphRelationship
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class GraphRelationship:
    """A directed, typed edge between two entities.

    The relationship carries its own ``tenant_id``
    (denormalised from the source entity) so a single
    index on ``kg_relations.tenant_id`` makes
    "list this tenant's edges" a constant-time read
    without joining the entities table.
    """

    # ----- identity --------------------------------------------------------

    id: uuid.UUID
    tenant_id: uuid.UUID

    # ----- timestamps -------------------------------------------------------

    # ``created_at`` is declared before the
    # defaulted fields because the dataclass
    # requires non-default fields to precede
    # defaulted ones. The factory in
    # :meth:`GraphRelationship.create` always
    # supplies ``created_at`` (defaulting to
    # ``datetime.now(UTC)`` when the caller does not
    # pass one).
    created_at: datetime

    # ----- content ----------------------------------------------------------

    # Both endpoints are *real* :class:`GraphEntity`
    # ids. The application service is responsible
    # for verifying that both ids belong to the
    # same tenant as the relationship; the
    # constructor validates the structural rule
    # (both must be UUIDs, both must be different).
    source_entity_id: uuid.UUID
    target_entity_id: uuid.UUID
    relationship_type: RelationshipType
    # Free-form properties — same JSON-serialise
    # constraint as ``GraphEntity.properties``.
    properties: dict[str, Any] = field(default_factory=dict)
    # The LLM's confidence in this assertion. A
    # relation with ``confidence < 0.5`` is
    # typically filtered out of the graph view.
    confidence: float = 1.0

    # ----- factories --------------------------------------------------------

    @classmethod
    def create(
        cls,
        *,
        tenant_id: uuid.UUID,
        source_entity_id: uuid.UUID,
        target_entity_id: uuid.UUID,
        relationship_type: RelationshipType | str,
        properties: dict[str, Any] | None = None,
        confidence: float = 1.0,
        now: datetime | None = None,
    ) -> Self:
        """Validate and create a new relationship.

        Business rules:

        * ``source_entity_id`` and ``target_entity_id``
          must be valid UUIDs.
        * The two ids must be different — a
          self-loop is a separate concept and gets
          a different exception type if the caller
          really means it (future V9 item).
        * ``relationship_type`` must be a known
          :class:`RelationshipType`.
        * ``confidence`` must be in [0.0, 1.0].
        * ``tenant_id`` must be a real UUID.
        """
        # --- endpoints ---
        if not isinstance(source_entity_id, uuid.UUID):
            raise ValidationException(
                message="source_entity_id must be a UUID",
                code=400,
                data={"field": "source_entity_id"},
            )
        if not isinstance(target_entity_id, uuid.UUID):
            raise ValidationException(
                message="target_entity_id must be a UUID",
                code=400,
                data={"field": "target_entity_id"},
            )
        if source_entity_id == target_entity_id:
            raise ValidationException(
                message="self-loops are not supported; create a node-level property instead",
                code=400,
                data={
                    "field": "target_entity_id",
                    "reason": "self_loop",
                },
            )

        # --- tenant_id ---
        if not isinstance(tenant_id, uuid.UUID):
            raise ValidationException(
                message="relationship must belong to a tenant",
                code=400,
                data={"field": "tenant_id"},
            )

        # --- relationship_type ---
        if isinstance(relationship_type, str):
            try:
                relationship_type = RelationshipType(relationship_type)
            except ValueError as exc:
                raise ValidationException(
                    message=f"unknown relationship_type '{relationship_type}'",
                    code=400,
                    data={
                        "field": "relationship_type",
                        "value": str(relationship_type),
                        "allowed": [t.value for t in RelationshipType],
                    },
                ) from exc

        # --- confidence ---
        try:
            confidence_f = float(confidence)
        except (TypeError, ValueError) as exc:
            raise ValidationException(
                message="confidence must be a number",
                code=400,
                data={"field": "confidence"},
            ) from exc
        if not (0.0 <= confidence_f <= 1.0):
            raise ValidationException(
                message="confidence must be between 0.0 and 1.0",
                code=400,
                data={"field": "confidence", "value": confidence_f},
            )

        # --- properties ---
        if properties is None:
            properties = {}
        if not isinstance(properties, dict):
            raise ValidationException(
                message="properties must be a dict",
                code=400,
                data={"field": "properties"},
            )
        try:
            json.dumps(properties)
        except (TypeError, ValueError) as exc:
            raise ValidationException(
                message="properties must be JSON-serialisable",
                code=400,
                data={"field": "properties", "error": str(exc)},
            ) from exc

        return cls(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            source_entity_id=source_entity_id,
            target_entity_id=target_entity_id,
            relationship_type=relationship_type,
            properties=properties,
            confidence=confidence_f,
            created_at=now or datetime.now(UTC),
        )

    @classmethod
    def from_persistence(
        cls,
        *,
        id: uuid.UUID,
        tenant_id: uuid.UUID,
        source_entity_id: uuid.UUID,
        target_entity_id: uuid.UUID,
        relationship_type: str | RelationshipType,
        properties: dict[str, Any],
        confidence: float,
        created_at: datetime,
    ) -> Self:
        if isinstance(relationship_type, str):
            relationship_type = RelationshipType(relationship_type)
        return cls(
            id=id,
            tenant_id=tenant_id,
            source_entity_id=source_entity_id,
            target_entity_id=target_entity_id,
            relationship_type=relationship_type,
            properties=properties,
            confidence=confidence,
            created_at=created_at,
        )


__all__ = ["GraphEntity", "GraphRelationship"]
