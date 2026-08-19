"""
Repositories for the knowledge-graph bounded context.

Two repositories, one per aggregate:

* :class:`GraphEntityRepository` — CRUD + search over
  the ``kg_entities`` table. Every query is
  tenant-scoped.
* :class:`GraphRelationshipRepository` — CRUD + list
  over the ``kg_relations`` table. Every query is
  tenant-scoped.

The repositories follow the same pattern as the V6
agent + tool repositories: a sync ``Session`` is
passed in, no transaction-boundary management
happens here, and a soft-delete (the V1+V3 doc calls
this ``deleted_at`` on the entity table — not yet
implemented here, the V1+V3 doc leaves it as a
"future" item) would land in ``delete`` when the
hard-delete + merge semantics are pinned down.

Cross-tenant access is the #1 invariant: every method
takes ``tenant_id`` and scopes the SQL by it. A
misbehaving caller that passes the wrong tenant id
gets a 404 (the row is not visible), not a 403 — the
same pattern as V1, V6, and the rest of the project.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import delete as sa_delete
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.knowledge_graph.domain.entities import GraphEntity, GraphRelationship
from src.knowledge_graph.domain.value_objects import (
    EntityType,
    RelationshipType,
)
from src.knowledge_graph.infrastructure.models import (
    KGEntityModel,
    KGRelationModel,
)
from src.shared.exceptions import ConflictException


# ---------------------------------------------------------------------------
# Mapping helpers
# ---------------------------------------------------------------------------


def _as_utc(value: datetime) -> datetime:
    """Re-attach UTC to naive datetimes from SQLite.

    Postgres preserves ``tzinfo`` natively; SQLite
    silently drops it on round-trip. The domain
    layer requires aware datetimes, so this is
    the only place the timezone is patched back on.
    """
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def _entity_to_model(entity: GraphEntity) -> KGEntityModel:
    """Map a domain entity to an ORM row for insertion."""
    return KGEntityModel(
        id=entity.id,
        tenant_id=entity.tenant_id,
        name=entity.name,
        entity_type=entity.entity_type.value,
        description=entity.description,
        properties=entity.properties,
        canonical_id=None,        # set by merge, not by create
        source_chunk_id=None,    # set by extraction, not by create
        created_at=entity.created_at,
        updated_at=entity.updated_at,
    )


def _model_to_entity(model: KGEntityModel) -> GraphEntity:
    """Map an ORM row back to a domain entity."""
    return GraphEntity.from_persistence(
        id=model.id,
        tenant_id=model.tenant_id,
        name=model.name,
        entity_type=model.entity_type,
        description=model.description,
        properties=model.properties or {},
        created_at=_as_utc(model.created_at),
        updated_at=_as_utc(model.updated_at),
        source_chunk_id=model.source_chunk_id,
        canonical_id=model.canonical_id,
    )


def _relation_to_model(rel: GraphRelationship) -> KGRelationModel:
    return KGRelationModel(
        id=rel.id,
        tenant_id=rel.tenant_id,
        source_entity_id=rel.source_entity_id,
        target_entity_id=rel.target_entity_id,
        relationship_type=rel.relationship_type.value,
        properties=rel.properties,
        confidence=rel.confidence,
        source_chunk_id=None,    # set by extraction, not by create
        created_at=rel.created_at,
    )


def _model_to_relation(model: KGRelationModel) -> GraphRelationship:
    return GraphRelationship.from_persistence(
        id=model.id,
        tenant_id=model.tenant_id,
        source_entity_id=model.source_entity_id,
        target_entity_id=model.target_entity_id,
        relationship_type=model.relationship_type,
        properties=model.properties or {},
        confidence=model.confidence,
        created_at=_as_utc(model.created_at),
    )


# ---------------------------------------------------------------------------
# GraphEntityRepository
# ---------------------------------------------------------------------------


class GraphEntityRepository:
    """Tenant-scoped CRUD over the ``kg_entities`` table.

    Every method takes ``tenant_id`` and scopes the
    SQL by it. ``create`` enforces a uniqueness
    constraint at the database layer (the
    ``uq_kg_entities_tenant_name_type`` constraint);
    a duplicate name within the same tenant raises
    :class:`ConflictException` (HTTP 409).
    """

    def __init__(self, db: Session) -> None:
        self._db = db

    def create(self, entity: GraphEntity) -> GraphEntity:
        """Persist a new entity.

        Raises :class:`ConflictException` if an entity
        with the same ``(name, entity_type)`` already
        exists for the tenant. The application layer
        is responsible for the *merge* step (a
        duplicate row's ``canonical_id`` points at
        the existing one) — the repository's job is
        to refuse a hard duplicate.
        """
        model = _entity_to_model(entity)
        try:
            self._db.add(model)
            self._db.flush()
        except Exception as exc:  # noqa: BLE001 - the inner branch translates IntegrityError
            self._db.rollback()
            err = str(exc)
            if (
                "uq_kg_entities_tenant_name_type" in err
                or "UNIQUE constraint failed: kg_entities" in err
                or "UNIQUE" in err.upper()
            ):
                raise ConflictException(
                    message="an entity with this name and type already exists for this tenant",
                    code=409,
                    data={
                        "field": "name",
                        "tenant_id": str(entity.tenant_id),
                        "name": entity.name,
                        "entity_type": entity.entity_type.value,
                    },
                ) from exc
            raise
        return _model_to_entity(model)

    def get(
        self, *, tenant_id: uuid.UUID, entity_id: uuid.UUID
    ) -> GraphEntity | None:
        """Fetch a single entity by id, scoped to the tenant."""
        stmt = select(KGEntityModel).where(
            KGEntityModel.id == entity_id,
            KGEntityModel.tenant_id == tenant_id,
        )
        model = self._db.execute(stmt).scalar_one_or_none()
        return _model_to_entity(model) if model else None

    def get_by_name(
        self,
        *,
        tenant_id: uuid.UUID,
        name: str,
        entity_type: "EntityType | str | None" = None,
    ) -> GraphEntity | None:
        """Fetch a single entity by ``(name, entity_type)``.

        The merge step uses this to check whether a
        candidate is a duplicate of an existing row.
        If ``entity_type`` is ``None``, the lookup
        matches any type — used by the cheap
        case-insensitive name fallback for merges
        where the LLM didn't supply a type.

        ``entity_type`` accepts either an
        :class:`EntityType` enum or a raw string;
        the latter is what comes back from the
        database (the column is ``String``) and
        what JSONB-derived callers see.
        """
        stmt = select(KGEntityModel).where(
            KGEntityModel.tenant_id == tenant_id,
            KGEntityModel.name == name,
        )
        if entity_type is not None:
            value = (
                entity_type.value
                if isinstance(entity_type, EntityType)
                else entity_type
            )
            stmt = stmt.where(KGEntityModel.entity_type == value)
        model = self._db.execute(stmt).scalar_one_or_none()
        return _model_to_entity(model) if model else None

    def update(self, entity: GraphEntity) -> GraphEntity:
        """Persist a modified entity.

        The repository trusts the entity's
        ``tenant_id`` and scopes the UPDATE by it.
        A cross-tenant update attempt becomes a
        no-op (rowcount=0); the caller treats that
        as 404.
        """
        stmt = (
            update(KGEntityModel)
            .where(
                KGEntityModel.id == entity.id,
                KGEntityModel.tenant_id == entity.tenant_id,
            )
            .values(
                name=entity.name,
                entity_type=entity.entity_type.value,
                description=entity.description,
                properties=entity.properties,
                updated_at=entity.updated_at,
            )
        )
        result = self._db.execute(stmt)
        if result.rowcount == 0:
            self._db.rollback()
            raise LookupError(f"entity {entity.id} not found for update")
        self._db.flush()
        return entity

    def delete(self, *, tenant_id: uuid.UUID, entity_id: uuid.UUID) -> bool:
        """Hard-delete an entity.

        The ``kg_relations`` table has a CASCADE FK
        on both endpoints, so every edge referencing
        this node is removed too. The
        ``document_chunks.source_chunk_id`` FK is
        SET NULL on delete, so the chunk survives.

        Returns ``True`` if a row was deleted,
        ``False`` if no live row matched.
        """
        stmt = sa_delete(KGEntityModel).where(
            KGEntityModel.id == entity_id,
            KGEntityModel.tenant_id == tenant_id,
        )
        result = self._db.execute(stmt)
        self._db.flush()
        return (result.rowcount or 0) > 0

    def search(
        self,
        *,
        tenant_id: uuid.UUID,
        query: str | None = None,
        entity_type: "EntityType | str | None" = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Sequence[GraphEntity]:
        """List / search entities for a tenant.

        ``query`` is a case-insensitive substring match
        on ``name``. ``entity_type`` filters to a
        single type when supplied. ``limit`` /
        ``offset`` are the standard pagination knobs.

        The search is deliberately a *substring*
        match rather than a full-text search: the
        graph UI is for browsing, not for finding
        every mention of a name. Full-text search
        stays in the V3 retrieval layer.

        ``entity_type`` accepts either an
        :class:`EntityType` enum or a raw string.
        """
        if limit <= 0:
            return ()
        stmt = (
            select(KGEntityModel)
            .where(KGEntityModel.tenant_id == tenant_id)
            .order_by(KGEntityModel.name.asc())
            .limit(limit)
            .offset(max(offset, 0))
        )
        if query:
            # ``ILIKE`` is PostgreSQL; on SQLite the
            # ``ilike`` operator is also available
            # (the SQLAlchemy dialect handles the
            # translation). The ``%`` wildcards are
            # what make it a substring match.
            stmt = stmt.where(KGEntityModel.name.ilike(f"%{query}%"))
        if entity_type is not None:
            value = (
                entity_type.value
                if isinstance(entity_type, EntityType)
                else entity_type
            )
            stmt = stmt.where(KGEntityModel.entity_type == value)
        models = self._db.execute(stmt).scalars().all()
        return [_model_to_entity(m) for m in models]

    def count(
        self,
        *,
        tenant_id: uuid.UUID,
        query: str | None = None,
        entity_type: "EntityType | str | None" = None,
    ) -> int:
        """Count entities for a tenant with the same filters as :meth:`search`."""
        from sqlalchemy import func

        stmt = select(func.count()).select_from(KGEntityModel).where(
            KGEntityModel.tenant_id == tenant_id,
        )
        if query:
            stmt = stmt.where(KGEntityModel.name.ilike(f"%{query}%"))
        if entity_type is not None:
            value = (
                entity_type.value
                if isinstance(entity_type, EntityType)
                else entity_type
            )
            stmt = stmt.where(KGEntityModel.entity_type == value)
        return int(self._db.execute(stmt).scalar_one())


# ---------------------------------------------------------------------------
# GraphRelationshipRepository
# ---------------------------------------------------------------------------


class GraphRelationshipRepository:
    """Tenant-scoped CRUD over the ``kg_relations`` table.

    Every method takes ``tenant_id`` and scopes the
    SQL by it. ``create`` enforces the
    ``uq_kg_relations_edge`` uniqueness constraint
    on ``(source, target, type)``; a duplicate raises
    :class:`ConflictException` (HTTP 409).
    """

    def __init__(self, db: Session) -> None:
        self._db = db

    def create(self, relationship: GraphRelationship) -> GraphRelationship:
        """Persist a new relationship.

        The application service is expected to have
        already verified that ``source_entity_id``
        and ``target_entity_id`` belong to the
        same tenant. The FKs on those columns take
        care of the database-level check.
        """
        model = _relation_to_model(relationship)
        try:
            self._db.add(model)
            self._db.flush()
        except Exception as exc:  # noqa: BLE001 - the inner branch translates IntegrityError
            self._db.rollback()
            # SQLite's IntegrityError message format
            # is "UNIQUE constraint failed: <table>.<col>"
            # and PostgreSQL's is "duplicate key value
            # violates unique constraint \"<name>\"".
            # Either form is a duplicate; translate to
            # the domain's ConflictException so the
            # API layer returns 409.
            err = str(exc)
            if (
                "uq_kg_relations_edge" in err
                or "UNIQUE constraint failed: kg_relations" in err
                or "duplicate key value" in err
            ):
                raise ConflictException(
                    message="this relationship already exists for this tenant",
                    code=409,
                    data={
                        "source_entity_id": str(relationship.source_entity_id),
                        "target_entity_id": str(relationship.target_entity_id),
                        "relationship_type": relationship.relationship_type.value,
                    },
                ) from exc
            raise
        return _model_to_relation(model)

    def get(
        self, *, tenant_id: uuid.UUID, relationship_id: uuid.UUID
    ) -> GraphRelationship | None:
        stmt = select(KGRelationModel).where(
            KGRelationModel.id == relationship_id,
            KGRelationModel.tenant_id == tenant_id,
        )
        model = self._db.execute(stmt).scalar_one_or_none()
        return _model_to_relation(model) if model else None

    def delete(self, *, tenant_id: uuid.UUID, relationship_id: uuid.UUID) -> bool:
        stmt = sa_delete(KGRelationModel).where(
            KGRelationModel.id == relationship_id,
            KGRelationModel.tenant_id == tenant_id,
        )
        result = self._db.execute(stmt)
        self._db.flush()
        return (result.rowcount or 0) > 0

    def list_for_entity(
        self,
        *,
        tenant_id: uuid.UUID,
        entity_id: uuid.UUID,
        direction: str = "both",
        relationship_type: RelationshipType | None = None,
        limit: int = 200,
    ) -> Sequence[GraphRelationship]:
        """List the relationships touching a single entity.

        ``direction`` is one of:

        * ``"outgoing"`` — ``entity_id`` is the source.
        * ``"incoming"`` — ``entity_id`` is the target.
        * ``"both"`` (default) — either endpoint.

        ``relationship_type`` filters to a single
        type when supplied. The query is the hot
        path of the graph UI's "explore this node"
        view, so the limit is generous (200) and
        the SQL uses the
        ``ix_kg_relations_source_target`` index.
        """
        if limit <= 0:
            return ()
        if direction == "outgoing":
            where_clause = KGRelationModel.source_entity_id == entity_id
        elif direction == "incoming":
            where_clause = KGRelationModel.target_entity_id == entity_id
        else:
            where_clause = (
                (KGRelationModel.source_entity_id == entity_id)
                | (KGRelationModel.target_entity_id == entity_id)
            )
        stmt = (
            select(KGRelationModel)
            .where(
                KGRelationModel.tenant_id == tenant_id,
                where_clause,
            )
            .order_by(KGRelationModel.confidence.desc())
            .limit(limit)
        )
        if relationship_type is not None:
            stmt = stmt.where(
                KGRelationModel.relationship_type == relationship_type.value
            )
        models = self._db.execute(stmt).scalars().all()
        return [_model_to_relation(m) for m in models]


__all__ = [
    "GraphEntityRepository",
    "GraphRelationshipRepository",
]
