"""
Domain exceptions for the knowledge-graph bounded context.

The exception hierarchy mirrors the rest of the project:
each domain exception subclasses
:class:`src.shared.exceptions.BaseAppException` so the
HTTP layer can translate the ``code`` field into a
status code without any per-exception switch.

A few design choices worth flagging:

* **EntityNotFound / RelationshipNotFound are 404.**
  Standard mapping; the API layer turns them into a
  structured 404 response. As elsewhere, the tenant
  id is part of the lookup key: an entity belonging
  to a different tenant is "not found" from the
  caller's perspective, never "forbidden".
* **InvalidEntityType / InvalidRelationship are 400.**
  Raised when the constructor sees a value the enum
  does not accept. The ``data`` field carries the
  field name and the offending value so the API
  layer can return a useful 400.
* **GraphTraversalFailed is 500.** Raised by the
  recursive-CTE compiler when the database returns
  an error (cycle in the data, exceeded depth limit,
  etc.). The user-facing message is deliberately
  generic; the operator sees the structured ``data``
  payload.
* **GraphExtractionFailed is 500.** Raised by the
  LLM-driven extractor when the model returns
  malformed JSON, hits a rate limit, or otherwise
  fails to produce the expected output. The
  extraction step is best-effort: a failed
  extraction does not roll back the document
  ingestion, it just logs the failure and moves on.

Per the project's hexagonal rule, no entity in the
domain layer imports from FastAPI, SQLAlchemy, or any
infrastructure concern.
"""

from __future__ import annotations

from src.shared.exceptions import BaseAppException


class EntityNotFound(BaseAppException):
    """Raised when an entity is not found for the requesting tenant."""

    def __init__(
        self,
        message: str = "entity not found",
        code: int = 404,
        data: dict | None = None,
    ) -> None:
        super().__init__(message, code, False, data=data)


class RelationshipNotFound(BaseAppException):
    """Raised when a relationship is not found for the requesting tenant."""

    def __init__(
        self,
        message: str = "relationship not found",
        code: int = 404,
        data: dict | None = None,
    ) -> None:
        super().__init__(message, code, False, data=data)


class InvalidEntityType(BaseAppException):
    """Raised when an entity's type is not in the closed enum.

    This is a 400 because the caller's request
    contained an unknown value — the API layer
    surfaces the list of allowed values in the
    response.
    """

    def __init__(
        self,
        message: str = "invalid entity type",
        code: int = 400,
        data: dict | None = None,
    ) -> None:
        super().__init__(message, code, False, data=data)


class InvalidRelationship(BaseAppException):
    """Raised when a relationship's structure is invalid.

    The application service raises this when
    validating a relationship payload before the
    domain constructor sees it — the payload is
    rejected before any database write is attempted.
    """

    def __init__(
        self,
        message: str = "invalid relationship",
        code: int = 400,
        data: dict | None = None,
    ) -> None:
        super().__init__(message, code, False, data=data)


class GraphTraversalFailed(BaseAppException):
    """Raised when a graph traversal query fails.

    Database-level errors (cycle in the data,
    exceeded recursion depth, syntax error in the
    generated SQL) raise this. The ``data`` payload
    carries the underlying database error code so
    the operator can drill in.
    """

    def __init__(
        self,
        message: str = "graph traversal failed",
        code: int = 500,
        data: dict | None = None,
    ) -> None:
        super().__init__(message, code, False, data=data)


class GraphExtractionFailed(BaseAppException):
    """Raised when the LLM-driven extractor cannot produce output.

    The extraction step is best-effort: the
    application service catches this and logs it
    rather than re-raising, so a failed extraction
    on one chunk does not block document ingestion.
    """

    def __init__(
        self,
        message: str = "graph extraction failed",
        code: int = 500,
        data: dict | None = None,
    ) -> None:
        super().__init__(message, code, False, data=data)


__all__ = [
    "EntityNotFound",
    "GraphExtractionFailed",
    "GraphTraversalFailed",
    "InvalidEntityType",
    "InvalidRelationship",
    "RelationshipNotFound",
]
