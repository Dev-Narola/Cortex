"""
SQLAlchemy ORM models for the knowledge-graph bounded context.

The V1+V3 schema (``Docs/database.md``) defines two
tables that this module implements:

* ``kg_entities`` — one row per real-world thing
  (PERSON, ORGANIZATION, …). The ``canonical_id`` self-FK
  is the merge primitive: a row that is a duplicate
  points its ``canonical_id`` to the "primary" entity
  row.
* ``kg_relations`` — one row per directed edge. The
  ``source_chunk_id`` FK to ``document_chunks`` is the
  traceability hook: every edge traces back to the
  text that produced it.

The schema lives in Postgres — the V5 trade-off was
"no managed services until a specific pain justifies
them", and Postgres + recursive CTEs covers every
graph query the V1+V3 doc calls for (``WITH RECURSIVE``
handles traversal of arbitrary depth). A future V9
hardening item could swap this layer for a true graph
database (the spec mentions Neo4j as a candidate) by
replacing this module + ``repositories.py`` with
Neo4j-specific implementations; the domain layer
above stays the same.

The V1+V3 doc also calls out the ``DOCUMENT_CHUNKS
||--o{ KG_ENTITIES : "source of"`` and
``KG_ENTITIES ||--o{ KG_RELATIONS : "source or target"``
relationships. Both are implemented as
``ForeignKey`` constraints with ``ondelete="SET NULL"``
for ``kg_entities.source_chunk_id`` (deleting a
document should not delete the entities extracted
from it) and ``ondelete="CASCADE"`` for
``kg_relations`` (an edge without either endpoint is
meaningless). The ``canonical_id`` self-FK is
``ondelete="SET NULL"`` — a merge's "from" entity
vanishes, the "to" entity stays, and the ``from``
becomes a non-canonical row.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    DateTime,
    Float,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
)
from sqlalchemy import Uuid as SAUuid
from sqlalchemy.orm import Mapped, mapped_column

from src.core.database import Base


class KGEntityModel(Base):
    """ORM mapping for the ``kg_entities`` table.

    One row per :class:`~src.knowledge_graph.domain.entities.GraphEntity`.
    The ``canonical_id`` self-FK supports the merge
    pattern: a row that is a duplicate has its
    ``canonical_id`` pointing to the "primary"
    entity record. Most rows will have ``canonical_id
    IS NULL`` (they are themselves primary).
    """

    __tablename__ = "kg_entities"

    # ----- identity ---------------------------------------------------------

    id: Mapped[uuid.UUID] = mapped_column(
        SAUuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        SAUuid(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ----- content ----------------------------------------------------------

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # The entity type. Stored as a string so a
    # future type added on the enum does not require
    # a column type change; the application layer
    # converts the string to a ``EntityType`` enum
    # at the boundary.
    entity_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    description: Mapped[str] = mapped_column(
        String(2000), nullable=False, default=""
    )
    # Free-form properties. ``JSON`` on PostgreSQL
    # (which the production target maps to JSONB);
    # ``TEXT`` on SQLite. The application layer
    # enforces JSON-serialisability before persisting.
    properties: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    # ----- merge support ----------------------------------------------------

    # The self-FK that powers the merge pattern.
    # ``SET NULL`` on delete so the merge's
    # "from" entity can be deleted without
    # cascading into the entity it was a copy of.
    canonical_id: Mapped[uuid.UUID | None] = mapped_column(
        SAUuid(as_uuid=True),
        ForeignKey("kg_entities.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Traceability to the source chunk. ``SET NULL``
    # on delete so a document can be removed
    # without removing the entities extracted
    # from it (the entities may be referenced by
    # other documents' extractions).
    source_chunk_id: Mapped[uuid.UUID | None] = mapped_column(
        SAUuid(as_uuid=True),
        ForeignKey("document_chunks.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # ----- timestamps -------------------------------------------------------

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    # ----- indexes / constraints --------------------------------------------

    __table_args__ = (
        # Tenant-scoped uniqueness on (name, type) so a
        # tenant cannot have two "Acme Corp" entities of
        # the same type with different ids. The merge
        # path is the one that resolves duplicates: the
        # extractor produces a candidate, the merge
        # service decides whether the new entity is a
        # duplicate of an existing one (and points
        # ``canonical_id`` at the existing row).
        UniqueConstraint(
            "tenant_id",
            "name",
            "entity_type",
            name="uq_kg_entities_tenant_name_type",
        ),
    )


class KGRelationModel(Base):
    """ORM mapping for the ``kg_relations`` table.

    One row per
    :class:`~src.knowledge_graph.domain.entities.GraphRelationship`.
    The ``(source_entity_id, target_entity_id,
    relationship_type)`` triple is what makes the row
    unique; a tenant cannot have the same edge declared
    twice.
    """

    __tablename__ = "kg_relations"

    # ----- identity ---------------------------------------------------------

    id: Mapped[uuid.UUID] = mapped_column(
        SAUuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        SAUuid(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ----- endpoints --------------------------------------------------------

    # Both endpoints are FKs to ``kg_entities``.
    # ``CASCADE`` on delete: a node without an
    # endpoint is meaningless, so the edge goes
    # with the node.
    source_entity_id: Mapped[uuid.UUID] = mapped_column(
        SAUuid(as_uuid=True),
        ForeignKey("kg_entities.id", ondelete="CASCADE"),
        nullable=False,
    )
    target_entity_id: Mapped[uuid.UUID] = mapped_column(
        SAUuid(as_uuid=True),
        ForeignKey("kg_entities.id", ondelete="CASCADE"),
        nullable=False,
    )
    # The edge label. Stored as a string for the
    # same reason as ``KGEntityModel.entity_type``:
    # adding a new value to the enum does not
    # require a schema change.
    relationship_type: Mapped[str] = mapped_column(
        String(32), nullable=False, index=True
    )

    # ----- content ----------------------------------------------------------

    properties: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    # The LLM's confidence in this assertion.
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)

    # ----- traceability -----------------------------------------------------

    # The chunk that produced this edge. ``SET NULL``
    # on delete so a document can be removed
    # without removing every edge extracted from
    # it (the same edge may be re-extracted from a
    # different chunk).
    source_chunk_id: Mapped[uuid.UUID | None] = mapped_column(
        SAUuid(as_uuid=True),
        ForeignKey("document_chunks.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ----- timestamps -------------------------------------------------------

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    # ----- indexes / constraints --------------------------------------------

    __table_args__ = (
        # The triple (source, type, target) is the
        # natural identity of an edge; a duplicate
        # row with the same triple but different
        # confidence is a re-extraction that the
        # application layer merges into a single row.
        UniqueConstraint(
            "source_entity_id",
            "target_entity_id",
            "relationship_type",
            name="uq_kg_relations_edge",
        ),
        Index(
            "ix_kg_relations_source_target",
            "source_entity_id",
            "target_entity_id",
        ),
    )


__all__ = ["KGEntityModel", "KGRelationModel"]
