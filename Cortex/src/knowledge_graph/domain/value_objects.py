"""
Value objects for the knowledge-graph bounded context.

A value object is defined by the values of its attributes
rather than by an identity. Two ``EntityType``
instances with the same value are considered equal; the
object is immutable. The construction-time validation
in :class:`EntityType` and :class:`RelationshipType`
guarantees that the rest of the codebase never has to
re-check the value — a passing constructor is a
permission slip to use the value anywhere downstream.

Three value objects live here:

* :class:`EntityType` — the closed enum of node kinds
  the platform supports. The spec lists eight
  (PERSON, ORGANIZATION, TECHNOLOGY, PROJECT, PRODUCT,
  LOCATION, CONCEPT, DOCUMENT); the UI uses the value
  to style a node and the search/filter layer uses it
  to scope a query.
* :class:`RelationshipType` — the closed enum of edge
  labels. The spec lists seven (CREATED, USES, OWNS,
  DEPENDS_ON, LOCATED_IN, WORKS_ON, RELATED_TO).
  ``RELATED_TO`` is the catch-all that the LLM-driven
  extractor falls back to when it cannot pick a more
  specific label.
* :class:`GraphPath` — an immutable result object
  returned by the traversal layer. A path is a list
  of nodes alternating with the relationships that
  connect them; the deepest path has ``len(nodes) - 1``
  edges.

Per the project's hexagonal rule, this module has no
imports from FastAPI, SQLAlchemy, or any infrastructure
concern. The enum values are plain strings so they
round-trip through the JSONB column without an adapter.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    # The entity / relationship types are defined in
    # the same module's neighbours; the type hints
    # below are not load-bearing for the value
    # objects themselves, but they make the
    # ``GraphPath`` shape discoverable from the
    # dataclass signature alone.
    pass


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class EntityType(str, Enum):  # noqa: UP042 - intentional str-Enum for JSON round-trip
    """Closed set of node kinds the platform supports.

    The eight values are the spec's list. A node's
    ``entity_type`` is one of these — the constructor
    raises :class:`InvalidEntityType` for anything
    else, so the database never sees a value the UI
    cannot render.

    Adding a new value is a deliberate schema change:
    existing UIs need to handle the new node style, and
    existing traversal queries may want to filter on
    it. The ``OTHER`` value is intentionally absent
    because an unknown node should fail fast rather
    than be silently downgraded.
    """

    PERSON = "person"
    ORGANIZATION = "organization"
    TECHNOLOGY = "technology"
    PROJECT = "project"
    PRODUCT = "product"
    LOCATION = "location"
    CONCEPT = "concept"
    DOCUMENT = "document"


class RelationshipType(str, Enum):  # noqa: UP042
    """Closed set of edge labels.

    Seven values per the spec. ``RELATED_TO`` is the
    catch-all used by the LLM-driven extractor when it
    cannot pick a more specific label — the alternative
    is dropping the edge, which loses signal. Operators
    can re-classify ``RELATED_TO`` edges in the UI by
    setting the ``properties.suggested_label`` field;
    a future V9 hardening item is an automated
    re-classification pass.
    """

    CREATED = "created"
    USES = "uses"
    OWNS = "owns"
    DEPENDS_ON = "depends_on"
    LOCATED_IN = "located_in"
    WORKS_ON = "works_on"
    RELATED_TO = "related_to"


# ---------------------------------------------------------------------------
# GraphPath — an immutable result of a traversal
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class GraphPath:
    """An ordered list of nodes and the relationships that connect them.

    The shape follows the natural "tell me a story"
    shape: the path starts at ``nodes[0]``, ends at
    ``nodes[-1]``, and the relationship at index ``i``
    in ``relationships`` connects ``nodes[i]`` to
    ``nodes[i+1]``. A length-1 path has zero
    relationships and depth 0; a length-2 path has one
    relationship and depth 1; etc.

    The dataclass is frozen so the traversal layer
    can hand it back to multiple callers without
    worrying about aliasing.
    """

    nodes: tuple["Any", ...] = field(default_factory=tuple)
    """The entities along the path, in order.

    A path with ``depth == 0`` has exactly one node;
    a path with ``depth == k`` has ``k + 1`` nodes.
    """

    relationships: tuple["Any", ...] = field(default_factory=tuple)
    """The relationships along the path, in order.

    ``len(relationships) == len(nodes) - 1`` for any
    well-formed path. The constructor enforces this.
    """

    depth: int = 0
    """The number of edges in the path.

    Equal to ``len(relationships)`` for a well-formed
    path; the field is stored separately so callers
    that want ``min_depth`` queries do not have to
    compute it.
    """

    def __post_init__(self) -> None:
        if self.depth < 0:
            raise ValueError(f"depth must be >= 0, got {self.depth}")
        if len(self.relationships) != self.depth:
            raise ValueError(
                f"len(relationships) ({len(self.relationships)}) must "
                f"equal depth ({self.depth})"
            )
        if len(self.nodes) != self.depth + 1:
            raise ValueError(
                f"len(nodes) ({len(self.nodes)}) must equal "
                f"depth + 1 ({self.depth + 1})"
            )

    def is_trivial(self) -> bool:
        """A trivial path is a single node with no edges.

        Trivial paths are the result of "find all
        neighbours of this node" queries that returned
        nothing — the start node itself, in isolation.
        Most consumers will want to filter these out
        at the API boundary.
        """
        return self.depth == 0

    def to_dict(self) -> dict[str, Any]:
        """Serialise to a dict for the REST/GraphQL response."""
        return {
            "nodes": [_entity_id(n) for n in self.nodes],
            "relationships": [_relationship_id(r) for r in self.relationships],
            "depth": self.depth,
        }


# ---------------------------------------------------------------------------
# Serialisation helpers
# ---------------------------------------------------------------------------


def _entity_id(node: Any) -> dict[str, Any]:
    """Coerce a node value into a dict-shaped response.

    The traversal layer returns :class:`GraphEntity`
    instances (defined in ``entities.py``); the
    ``GraphPath`` dataclass does not import that
    class to keep the value-object module free of
    infrastructure concerns. The shape returned here
    is what the API contract wants — a flat dict
    that includes the entity id, name, and type so
    the client can render the path without a second
    round trip.
    """
    # ``getattr`` with a default keeps this function
    # robust against mock entities in tests.
    return {
        "id": str(getattr(node, "id", "")),
        "name": getattr(node, "name", ""),
        "entity_type": _enum_value(getattr(node, "entity_type", "")),
        "tenant_id": str(getattr(node, "tenant_id", "")),
    }


def _relationship_id(rel: Any) -> dict[str, Any]:
    """Coerce a relationship value into a dict."""
    return {
        "id": str(getattr(rel, "id", "")),
        "type": _enum_value(getattr(rel, "relationship_type", "")),
        "source_entity_id": str(getattr(rel, "source_entity_id", "")),
        "target_entity_id": str(getattr(rel, "target_entity_id", "")),
        "confidence": getattr(rel, "confidence", 0.0),
    }


def _enum_value(value: Any) -> str:
    """Return ``.value`` for enums, the input for everything else.

    Lets the helper work on enum-typed domain values
    *and* on raw strings (e.g. when the API serialises
    a value that was loaded from a JSONB column).
    """
    return getattr(value, "value", value)


__all__ = [
    "EntityType",
    "GraphPath",
    "RelationshipType",
]
