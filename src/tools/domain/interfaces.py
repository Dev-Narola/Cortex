"""
Domain interfaces for the tools bounded context.

The :class:`BaseTool` interface is the contract every
concrete tool implementation fulfils. The interface is
deliberately small — three methods, no decorators, no
metaclass magic — so a tool can be implemented in a few
lines of plain Python.

The interface lives in the domain layer because:

* it depends on no infrastructure concern (no SQLAlchemy,
  no FastAPI, no LLM SDK),
* the registry, the executor, and the route handlers all
  depend on it,
* a new tool implementation only needs to import this
  module to participate in the system.

A concrete tool is the example given in the spec
(``SearchTool``, ``CalculatorTool``, ``KnowledgeSearchTool``);
ship-ready implementations are added in a follow-up.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class BaseTool(ABC):
    """The interface every tool implementation fulfils.

    Three methods:

    * :meth:`name` — the unique tool name, matching the
      ``Tool.name`` field on the persistent entity. The
      registry matches the two and refuses to register a
      handler whose ``name()`` clashes with a known
      tool.
    * :meth:`describe` — returns a JSON-Schema-shaped dict
      the LLM is shown when deciding which tool to call.
      The shape matches the OpenAI / Anthropic function-
      calling convention so a tool's description can be
      passed to the LLM verbatim.
    * :meth:`execute` — runs the tool with the LLM-supplied
      arguments and returns the result. The result is
      serialised to a JSON string by the executor; tools
      can return either a Python object (which will be
      ``json.dumps``-ed) or a string (which is passed
      through).

    Concrete tools do *not* raise on bad input. They
    return a structured error dict so the agent loop
    can recover and the LLM can decide what to try
    next. Raising from ``execute`` is reserved for
    unrecoverable failures (database down, etc.).
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """The tool's unique name. Used by the registry for lookup."""

    @abstractmethod
    def describe(self) -> dict[str, Any]:
        """Return a JSON-Schema-shaped description of this tool.

        The shape is::

            {
                "name": "tool_name",
                "description": "What the tool does",
                "parameters": {
                    "type": "object",
                    "properties": {...},
                    "required": [...]
                }
            }

        This is the shape the LLM is shown when deciding
        whether to call the tool.
        """

    @abstractmethod
    async def execute(self, **kwargs: Any) -> Any:
        """Run the tool with the LLM-supplied arguments.

        ``kwargs`` is whatever the LLM passed. The tool
        validates the input shape (the spec calls this
        out as a separate method ``validate_input``,
        but folding it into ``execute`` keeps the
        interface smaller and ensures every call goes
        through validation). Returns a JSON-serialisable
        value, or a structured error dict with at least
        an ``error`` key.
        """


__all__ = ["BaseTool"]
