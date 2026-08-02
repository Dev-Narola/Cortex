"""
Safeguards for the agent loop.

Two distinct concerns live in this module:

* :class:`ExecutionGuard` — hard numeric caps. The loop
  calls :meth:`check_iteration`, :meth:`check_elapsed`,
  and :meth:`check_tool_calls` before each step. The
  guard never *fixes* a runaway loop; it just *stops* it
  at a defined boundary. A trip is a normal, expected
  outcome of an agent that needs more resources than its
  configuration allowed for.

* :class:`LoopDetector` — pattern detection. The loop
  records every tool call and checks for repeating
  patterns (e.g. ``search → summarize → search →
  summarize``). A hit is a *bug*, not a configuration
  issue: either the agent's prompt is leading the LLM
  into a cycle, or the tool the LLM is calling is
  returning results that look identical from the
  LLM's perspective. The two cases require different
  operator responses (prompt edit vs. tool bug), so the
  detector returns the *pattern* it spotted, not just a
  boolean.

Both safeguards are pure: no I/O, no LLM, no clock
other than the monotonic one. The loop passes them
in via DI; the executor instantiates them with the
agent's configuration.

The agent is in :class:`src.execution.application.agent_loop`,
not here, because the loop and the guard are coupled
(``ExecutionGuard.check_*`` raises the same exception
types the loop expects to catch). The guard's exception
types live in :mod:`src.agents.domain.exceptions` so the
interface layer can translate them into the right HTTP
status code (429 for rate-limit-style, 409 for "stopped
by guard").
"""

from __future__ import annotations

import time
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass, field

from src.agents.domain.exceptions import AgentExecutionFailed


# ---------------------------------------------------------------------------
# Exceptions raised by the guard
# ---------------------------------------------------------------------------


class ExecutionGuardTripped(AgentExecutionFailed):
    """Raised by :class:`ExecutionGuard` when a hard cap is hit.

    The :class:`AgentExecutor` catches this, marks the
    run ``STOPPED`` (not ``FAILED`` — a guard trip is a
    *known* outcome, not an error), and returns the
    partial output. The HTTP layer surfaces this as
    409 (conflict with the agent's configuration).
    """

    def __init__(self, *, reason: str, code: int = 409, data: dict | None = None) -> None:
        super().__init__(
            message=f"execution guard tripped: {reason}",
            code=code,
            data=data or {"reason": reason},
        )


# ---------------------------------------------------------------------------
# ExecutionGuard
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class ExecutionLimits:
    """Hard caps for a single agent run.

    Carried as a value object so the same configuration
    can be passed to both the guard and the loop without
    the guard having to re-read the agent's
    configuration on every check.

    The defaults match the V3 conversation defaults
    (10 iterations, 60 seconds, 20 tool calls) and are
    small enough to stop a runaway agent before it
    burns meaningful resources on a t3.small.
    """

    max_iterations: int = 10
    max_execution_time_seconds: float = 60.0
    max_tool_calls: int = 20


class ExecutionGuard:
    """Hard numeric caps for the agent loop.

    The guard holds a monotonic clock (``time.monotonic``)
    at construction time. Each call to :meth:`check_*`
    compares the current state to the cap; a trip raises
    :class:`ExecutionGuardTripped` with a structured
    reason. The guard never silently caps — every
    violation is loud, so the operator can see why the
    agent stopped.
    """

    def __init__(
        self,
        limits: ExecutionLimits,
        *,
        clock: "callable[[], float] | None" = None,
    ) -> None:
        self._limits = limits
        self._started = (clock or time.monotonic)()

    @property
    def limits(self) -> ExecutionLimits:
        return self._limits

    @property
    def elapsed(self) -> float:
        return (time.monotonic)() - self._started

    def check_iteration(self, iteration: int) -> None:
        if iteration > self._limits.max_iterations:
            raise ExecutionGuardTripped(
                reason=f"max_iterations={self._limits.max_iterations} exceeded",
                data={
                    "limit": self._limits.max_iterations,
                    "iteration": iteration,
                    "kind": "iteration",
                },
            )

    def check_tool_calls(self, tool_calls: int) -> None:
        if tool_calls > self._limits.max_tool_calls:
            raise ExecutionGuardTripped(
                reason=f"max_tool_calls={self._limits.max_tool_calls} exceeded",
                data={
                    "limit": self._limits.max_tool_calls,
                    "tool_calls": tool_calls,
                    "kind": "tool_calls",
                },
            )

    def check_elapsed(self) -> None:
        if self.elapsed > self._limits.max_execution_time_seconds:
            raise ExecutionGuardTripped(
                reason=f"max_execution_time_seconds={self._limits.max_execution_time_seconds} exceeded",
                data={
                    "limit": self._limits.max_execution_time_seconds,
                    "elapsed": self.elapsed,
                    "kind": "elapsed",
                },
            )


# ---------------------------------------------------------------------------
# LoopDetector
# ---------------------------------------------------------------------------


@dataclass
class LoopDetector:
    """Detect repeating tool-call patterns.

    The detector keeps a sliding window of the last
    ``window_size`` tool calls and counts the most
    common pattern. A pattern is a sequence of tool
    names (e.g. ``("search", "summarize", "search")``).
    The detector trips when the same pattern appears
    ``threshold`` times in the window.

    The default ``window_size=6`` and ``threshold=3``
    mean: the last six tool calls contain the same
    three-tool sequence at least three times. For a
    canonical two-tool ping-pong (``search``,
    ``summarize``, ``search``, ``summarize``), the
    detector trips on the fourth call.

    A trip is a ``bool`` plus the offending pattern, so
    the operator can see *what* loop the agent got
    into.
    """

    window_size: int = 6
    threshold: int = 3
    # The shortest pattern the detector considers.
    # ``1`` matches single-tool repetition (e.g. the
    # agent calls ``search`` 4 times in a row). ``2``
    # is the more typical ping-pong detection
    # (``search``-``summarize``-``search``-``summarize``).
    min_pattern_length: int = 2
    # The tool-call history. ``field(default_factory=list)``
    # so each detector instance has its own buffer.
    _history: list[str] = field(default_factory=list)
    _last_pattern: tuple[str, ...] | None = None

    def observe(self, tool_name: str) -> None:
        self._history.append(tool_name)
        # Trim the buffer to ``window_size`` items.
        if len(self._history) > self.window_size:
            self._history = self._history[-self.window_size:]

    def is_looping(self) -> bool:
        if len(self._history) < self.threshold * self.min_pattern_length:
            return False
        # Find the shortest pattern (>= min_pattern_length)
        # that repeats at least ``threshold`` times in the
        # window. The maximum pattern length is bounded by
        # ``window // threshold`` — the largest pattern
        # that could possibly repeat ``threshold`` times in
        # the available window.
        max_pattern = max(
            self.min_pattern_length,
            len(self._history) // self.threshold,
        )
        for length in range(self.min_pattern_length, max_pattern + 1):
            counts: Counter[tuple[str, ...]] = Counter()
            for i in range(len(self._history) - length + 1):
                counts[tuple(self._history[i:i + length])] += 1
            for pattern, count in counts.items():
                if count >= self.threshold:
                    self._last_pattern = pattern
                    return True
        return False

    @property
    def last_pattern(self) -> tuple[str, ...] | None:
        """The pattern that triggered the last ``is_looping()`` hit."""
        return self._last_pattern

    def history(self) -> tuple[str, ...]:
        """Return the current tool-call history (for diagnostics)."""
        return tuple(self._history)


__all__ = [
    "ExecutionGuard",
    "ExecutionGuardTripped",
    "ExecutionLimits",
    "LoopDetector",
]
