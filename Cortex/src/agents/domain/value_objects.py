"""
Value objects for the agents bounded context.

A value object is defined by the values of its attributes rather
than by an identity. Two ``AgentConfiguration`` instances with the
same fields are considered equal, and the object is immutable.
The constructor is the only place that enforces the field-level
constraints; once constructed, the object is safe to share
across threads, agent runs, and tenant contexts.

The constraints are deliberately tight:

* ``max_iterations > 0`` — every agent run must be allowed at
  least one iteration, otherwise the loop would never start. The
  upper bound is enforced by ``ExecutionGuard`` (Phase 6), not
  here, because the upper bound is a *safety* concern that the
  system imposes, not a *correctness* concern the value object
  imposes.
* ``temperature in [0, 2]`` — matches the OpenAI/Anthropic public
  API range. Going outside that range is not supported by the
  current adapters and would either be silently clamped (bad UX)
  or rejected by the provider (bad error message). Failing at
  construction time surfaces the error at the closest possible
  point.
* ``max_tokens > 0`` — a non-positive token budget would be a
  misconfiguration; the LLM would either return empty output
  or error. The constructor rejects it.
* ``allowed_tools`` is an unordered set of tool names. ``None``
  is treated as "all tools in the registry" — the registry
  applies the permission check at execution time, not the
  configuration.
* ``memory_enabled`` defaults to ``False``; multi-turn agent
  memory is a V9 hardening item and the default keeps the
  surface honest about what is currently implemented.

Per the project's hexagonal rule, this module has no imports
from FastAPI, SQLAlchemy, or any infrastructure concern.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Any, Self

from src.agents.domain.exceptions import InvalidAgentConfiguration


@dataclass(frozen=True, slots=True)
class AgentConfiguration:
    """Immutable configuration attached to an :class:`Agent`.

    The fields are intentionally minimal — only the values that
    change the *behaviour* of the agent loop live here. Operational
    metadata (status, timestamps, owner) is on the entity, not on
    the value object.
    """

    # Hard ceiling on the number of LLM-call iterations per run.
    # Picked at 10 because it is large enough for the canonical
    # "retrieve → summarize → answer" three-step flow plus a
    # reasonable safety margin, and small enough that a runaway
    # agent never burns the tenant's token budget.
    max_iterations: int = 10

    # LLM sampling temperature. 0.0 = deterministic, 2.0 = wild.
    # The default of 0.2 matches the V3 conversation path so an
    # agent behaves like a chat turn out of the box.
    temperature: float = 0.2

    # Hard cap on output tokens per LLM call. Distinct from the
    # context window (which is on the LLM provider config); this
    # is the per-response cap. 1024 is the V3 default.
    max_tokens: int = 1024

    # Optional allow-list of tool names. ``None`` means "all tools
    # the agent has been granted by the registry"; an explicit
    # empty tuple / frozenset means "no tools at all" (the agent
    # can answer from its own knowledge only).
    allowed_tools: frozenset[str] | None = None

    # When True, the agent persists conversation context across
    # runs. Currently a no-op in V6; the field exists so the
    # configuration object is forward-compatible with the V9
    # memory feature without requiring a schema change.
    memory_enabled: bool = False

    # ----- constraints ----------------------------------------------------

    def __post_init__(self) -> None:
        # ``max_iterations`` must be a positive integer. We reject
        # zero explicitly (would block the first iteration) and
        # negative values (would be a logic error).
        if not isinstance(self.max_iterations, int) or self.max_iterations <= 0:
            raise InvalidAgentConfiguration(
                message="max_iterations must be a positive integer",
                code=400,
                data={
                    "field": "max_iterations",
                    "value": self.max_iterations,
                    "constraint": "int > 0",
                },
            )

        # ``temperature`` is the public LLM-API range. Anything
        # outside [0, 2] is rejected at construction.
        if not isinstance(self.temperature, (int, float)) or not (0.0 <= float(self.temperature) <= 2.0):
            raise InvalidAgentConfiguration(
                message="temperature must be between 0.0 and 2.0",
                code=400,
                data={
                    "field": "temperature",
                    "value": self.temperature,
                    "constraint": "0.0 <= temperature <= 2.0",
                },
            )

        # ``max_tokens`` must be a positive integer. The exact
        # upper bound depends on the chosen model and is enforced
        # by the LLM provider, not by this object.
        if not isinstance(self.max_tokens, int) or self.max_tokens <= 0:
            raise InvalidAgentConfiguration(
                message="max_tokens must be a positive integer",
                code=400,
                data={
                    "field": "max_tokens",
                    "value": self.max_tokens,
                    "constraint": "int > 0",
                },
            )

        # ``allowed_tools`` normalisation: anything iterable is
        # accepted, and the value is always stored as a
        # ``frozenset`` so the dataclass ``frozen=True`` invariant
        # holds. The normalised form is what gets persisted.
        if self.allowed_tools is not None:
            object.__setattr__(
                self,
                "allowed_tools",
                frozenset(self.allowed_tools),
            )

    # ----- helpers --------------------------------------------------------

    def with_overrides(self, **changes: Any) -> Self:
        """Return a new :class:`AgentConfiguration` with the given fields replaced.

        The dataclass is frozen, so the only way to "change" a
        field is to construct a new instance. This helper exists
        so the application layer's update service can express
        "update this field" without juggling ``replace()`` and
        re-validating the entire object (which ``__post_init__``
        does for us automatically).
        """
        return replace(self, **changes)

    def to_dict(self) -> dict[str, Any]:
        """Serialise to a plain dict for the ``configuration`` JSONB column.

        The shape is stable and versioned by the column itself
        (the column is JSONB, not strongly typed), so the API
        layer can round-trip it without losing information.
        """
        return {
            "max_iterations": self.max_iterations,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "allowed_tools": (
                sorted(self.allowed_tools) if self.allowed_tools is not None else None
            ),
            "memory_enabled": self.memory_enabled,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Self:
        """Construct from the dict shape produced by :meth:`to_dict`.

        Defensive about field defaults so an older configuration
        stored before a new field was introduced still loads.
        Anything missing falls back to the dataclass default; the
        constraints in ``__post_init__`` still apply.
        """
        allowed = data.get("allowed_tools")
        return cls(
            max_iterations=data.get("max_iterations", 10),
            temperature=float(data.get("temperature", 0.2)),
            max_tokens=data.get("max_tokens", 1024),
            allowed_tools=frozenset(allowed) if allowed is not None else None,
            memory_enabled=bool(data.get("memory_enabled", False)),
        )

    def permits_tool(self, tool_name: str) -> bool:
        """Return True when the tool is in the allow-list (or there is no list)."""
        if self.allowed_tools is None:
            return True
        return tool_name in self.allowed_tools


__all__ = ["AgentConfiguration"]
