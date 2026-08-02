"""
Domain exceptions for the agents bounded context.

These exceptions carry an HTTP-shaped ``code`` (status code) so the
interface layer can translate them into structured error responses
via the existing ``BaseAppException`` machinery in
:mod:`src.shared.exceptions`. A few design choices worth flagging:

* **AgentNotFound is 404.** Standard mapping; the API layer turns
  it into a structured error body.
* **AgentInactive is 409.** The agent exists but cannot be used in
  its current state. 409 is the right code for "the request
  conflicts with the current state of the resource" (RFC 9110).
* **InvalidAgentConfiguration is 400.** Raised by the
  :class:`~src.agents.domain.value_objects.AgentConfiguration`
  value-object constructor and re-raised by the application
  services so the API layer surfaces a clear 400 with the field
  name in the response.
* **AgentExecutionFailed is 500.** The runtime failure is a
  server-side problem (LLM down, tool raised, guardrail tripped).
  Surfaced as 500; the response body includes a generic message
  with the failure category so the operator can drill in.

Per the project's hexagonal rule, no entity in the domain layer
imports from FastAPI, SQLAlchemy, or any infrastructure concern.
These exceptions subclass :class:`src.shared.exceptions.BaseAppException`
which itself only depends on the standard library.
"""

from __future__ import annotations

from src.shared.exceptions import BaseAppException


class AgentNotFound(BaseAppException):
    """Raised when an agent is not found for the requesting tenant.

    The tenant id is part of the lookup key: an agent belonging to
    a different tenant is "not found" from the caller's perspective,
    never "forbidden". This avoids leaking the existence of
    resources across the tenant boundary.
    """

    def __init__(
        self,
        message: str = "agent not found",
        code: int = 404,
        data: dict | None = None,
    ) -> None:
        super().__init__(message, code, False, data=data)


class AgentInactive(BaseAppException):
    """Raised when an execution is attempted against a non-active agent.

    An :class:`~src.agents.domain.entities.AgentStatus.ARCHIVED` agent
    cannot be executed (it is read-only for historical context). An
    :class:`~src.agents.domain.entities.AgentStatus.INACTIVE` agent
    is paused by the tenant owner and likewise cannot be executed.
    """

    def __init__(
        self,
        message: str = "agent is not active and cannot be executed",
        code: int = 409,
        data: dict | None = None,
    ) -> None:
        super().__init__(message, code, False, data=data)


class InvalidAgentConfiguration(BaseAppException):
    """Raised when an agent's :class:`AgentConfiguration` is invalid.

    The :class:`AgentConfiguration` value object's constructor
    raises this directly so the failure surfaces at the earliest
    possible point (the field-level validator, not the service).
    The ``data`` field carries the offending field name and the
    expected constraint so the API layer can return a useful 400.
    """

    def __init__(
        self,
        message: str = "invalid agent configuration",
        code: int = 400,
        data: dict | None = None,
    ) -> None:
        super().__init__(message, code, False, data=data)


class AgentExecutionFailed(BaseAppException):
    """Raised when an agent run fails for a runtime reason.

    This is a server-side failure: the LLM returned an error, a
    tool raised, a safeguard tripped, or the rate limiter blocked
    the run. The ``data`` payload carries the failure category so
    the operator can route the alert; the user-facing message is
    deliberately generic.
    """

    def __init__(
        self,
        message: str = "agent execution failed",
        code: int = 500,
        data: dict | None = None,
    ) -> None:
        super().__init__(message, code, False, data=data)


__all__ = [
    "AgentExecutionFailed",
    "AgentInactive",
    "AgentNotFound",
    "InvalidAgentConfiguration",
]
