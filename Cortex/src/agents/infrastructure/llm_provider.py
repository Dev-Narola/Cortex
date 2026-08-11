"""
LLM provider interface for the agents bounded context.

A single abstract base class (``LLMProvider``) and one
concrete adapter (the OpenAI adapter the rest of the
platform already uses for chat) is shipped in V6. The
shape is deliberately small so a new provider is a
two-method subclass, not a re-implementation.

Two methods:

* :meth:`generate` — the canonical "ask the LLM and
  return a single result" path. Returns a
  :class:`LLMResult` with the model's text, any tool
  calls it asked for, the token count, and a finish
  reason. The agent loop calls this once per iteration.
* :meth:`stream` — a token-by-token variant for
  real-time UI updates. Returns an async iterator; the
  caller is responsible for buffering the chunks into
  the final :class:`LLMResult`.

The interface lives in the infrastructure layer because
the *implementation* is the LLM SDK (OpenAI, Anthropic,
local), and the abstraction the domain layer needs is
the abstract method. The agent loop depends on the
abstract ``LLMProvider`` type; the application services
inject a concrete instance via DI.

The spec calls out "no provider lock-in" — the agent
loop's reasoning is identical regardless of provider,
which is the point of having an interface here. A
provider adapter for Anthropic or a local model is a
~30-line subclass that maps the provider's SDK to
:class:`LLMResult`.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

from src.core.config import settings


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class ToolCallRequest:
    """A single tool call the LLM asked for.

    The fields match the OpenAI / Anthropic function-
    calling shape verbatim. ``id`` is the provider's
    call id (used to correlate the tool's response with
    the call that requested it); ``name`` is the tool
    name; ``arguments`` is the parsed JSON object the
    LLM passed.
    """

    id: str
    name: str
    arguments: dict[str, Any]


@dataclass(frozen=True, slots=True)
class LLMResult:
    """The canonical "ask the LLM" result.

    ``finish_reason`` is one of:

    * ``"stop"`` — the model produced a final answer; the
      agent loop should return ``output`` to the caller.
    * ``"tool_calls"`` — the model asked for one or more
      tool invocations; the agent loop should call the
      tools and loop.
    * ``"length"`` — the model hit the ``max_tokens``
      limit; the agent loop should treat this as an
      incomplete answer and either retry with a higher
      limit (if the configuration allows it) or surface
      the partial output.
    * ``"error"`` — the provider returned an error; the
      agent loop should fail the run with the provider's
      message.
    """

    output: str
    tool_calls: tuple[ToolCallRequest, ...] = ()
    finish_reason: str = "stop"
    prompt_tokens: int = 0
    completion_tokens: int = 0


# ---------------------------------------------------------------------------
# Abstract base
# ---------------------------------------------------------------------------


class LLMProvider(ABC):
    """The single seam between the agent loop and any LLM backend."""

    @abstractmethod
    async def generate(
        self,
        *,
        model: str,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        temperature: float = 0.2,
        max_tokens: int = 1024,
    ) -> LLMResult:
        """Ask the LLM and return a single :class:`LLMResult`.

        ``messages`` is the standard chat-messages shape:
        a list of ``{"role": "user"|"assistant"|"tool", ...}``
        dicts. ``tools`` is a list of tool descriptions in
        the OpenAI function-calling shape; ``None`` means
        "do not offer the LLM any tools" (a pure chat
        agent).
        """

    @abstractmethod
    def stream(
        self,
        *,
        model: str,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        temperature: float = 0.2,
        max_tokens: int = 1024,
    ) -> AsyncIterator[LLMResult]:
        """Token-by-token variant of :meth:`generate`.

        Yields a final :class:`LLMResult` (with the
        accumulated ``output``, all ``tool_calls``, and
        the ``finish_reason``) as the last chunk. The
        caller is responsible for buffering the stream
        into the run's ``steps`` record.
        """


# ---------------------------------------------------------------------------
# OpenAI concrete adapter
# ---------------------------------------------------------------------------


class OpenAILLMProvider(LLMProvider):
    """The OpenAI adapter for the agent loop.

    The adapter is intentionally minimal: it translates
    between the abstract :class:`LLMResult` and the
    OpenAI SDK's response. The OpenAI Python SDK is
    already a project dependency (the conversation
    context uses it for chat completions); no new
    dependency is added.

    The provider is the place where ``temperature``,
    ``max_tokens``, and the model id are passed *to* the
    SDK. The agent loop is provider-agnostic; the
    configuration is bound here.
    """

    def __init__(self, api_key: str | None = None) -> None:
        # Import inside the constructor so the module
        # loads without the SDK being installed (useful
        # for unit tests that stub the provider).
        from openai import AsyncOpenAI

        self._client = AsyncOpenAI(
            api_key=api_key or settings.OPENAI_API_KEY,
        )

    async def generate(
        self,
        *,
        model: str,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        temperature: float = 0.2,
        max_tokens: int = 1024,
    ) -> LLMResult:
        payload: dict[str, Any] = {
            "model": model,
            "temperature": float(temperature),
            "max_tokens": int(max_tokens),
            "messages": [{"role": "system", "content": system}, *messages],
        }
        if tools:
            payload["tools"] = [
                {"type": "function", "function": t} for t in tools
            ]

        response = await self._client.chat.completions.create(**payload)
        choice = response.choices[0]
        message = choice.message
        tool_calls: tuple[ToolCallRequest, ...] = ()
        if getattr(message, "tool_calls", None):
            tool_calls = tuple(
                ToolCallRequest(
                    id=tc.id,
                    name=tc.function.name,
                    # ``tc.function.arguments`` arrives as a
                    # JSON string. Parse here so the agent
                    # loop gets a real dict.
                    arguments=(
                        json.loads(tc.function.arguments)
                        if isinstance(tc.function.arguments, str)
                        else (tc.function.arguments or {})
                    ),
                )
                for tc in message.tool_calls
            )
        usage = response.usage or None
        return LLMResult(
            output=message.content or "",
            tool_calls=tool_calls,
            finish_reason=str(choice.finish_reason or "stop"),
            prompt_tokens=int(usage.prompt_tokens) if usage else 0,
            completion_tokens=int(usage.completion_tokens) if usage else 0,
        )

    async def stream(  # type: ignore[override]
        self,
        *,
        model: str,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        temperature: float = 0.2,
        max_tokens: int = 1024,
    ) -> AsyncIterator[LLMResult]:
        # The default implementation falls back to
        # ``generate`` and yields a single final chunk.
        # Subclasses (or future Anthropic / local adapters)
        # can override this for true token-level streaming.
        result = await self.generate(
            model=model,
            system=system,
            messages=messages,
            tools=tools,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        yield result


# ---------------------------------------------------------------------------
# NVIDIA concrete adapter
# ---------------------------------------------------------------------------


class NvidiaLLMProvider(LLMProvider):
    """The NVIDIA NIM adapter for the agent loop.

    NVIDIA's hosted inference endpoint
    (``integrate.api.nvidia.com``) exposes an
    OpenAI-compatible REST surface. We point the same
    ``openai`` Python SDK at a different ``base_url`` —
    no new dependency.

    The provider mirrors :class:`OpenAILLMProvider`'s
    surface so the agent loop is provider-agnostic.
    Tenant boundaries are enforced at the
    application/retrieval layer; the provider is a thin
    HTTP client.
    """

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
    ) -> None:
        from openai import AsyncOpenAI

        self._client = AsyncOpenAI(
            api_key=api_key or settings.NVIDIA_API_KEY,
            base_url=base_url or settings.NVIDIA_BASE_URL,
        )

    async def generate(
        self,
        *,
        model: str,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        temperature: float = 0.2,
        max_tokens: int = 1024,
    ) -> LLMResult:
        payload: dict[str, Any] = {
            "model": model,
            "temperature": float(temperature),
            "max_tokens": int(max_tokens),
            "messages": [{"role": "system", "content": system}, *messages],
        }
        if tools:
            payload["tools"] = [
                {"type": "function", "function": t} for t in tools
            ]

        response = await self._client.chat.completions.create(**payload)
        choice = response.choices[0]
        message = choice.message
        tool_calls: tuple[ToolCallRequest, ...] = ()
        if getattr(message, "tool_calls", None):
            tool_calls = tuple(
                ToolCallRequest(
                    id=tc.id,
                    name=tc.function.name,
                    arguments=(
                        json.loads(tc.function.arguments)
                        if isinstance(tc.function.arguments, str)
                        else (tc.function.arguments or {})
                    ),
                )
                for tc in message.tool_calls
            )
        usage = response.usage or None
        return LLMResult(
            output=message.content or "",
            tool_calls=tool_calls,
            finish_reason=str(choice.finish_reason or "stop"),
            prompt_tokens=int(usage.prompt_tokens) if usage else 0,
            completion_tokens=int(usage.completion_tokens) if usage else 0,
        )

    async def stream(  # type: ignore[override]
        self,
        *,
        model: str,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        temperature: float = 0.2,
        max_tokens: int = 1024,
    ) -> AsyncIterator[LLMResult]:
        result = await self.generate(
            model=model,
            system=system,
            messages=messages,
            tools=tools,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        yield result


# A small ``json`` import is needed by ``generate`` to
# parse the arguments string. Imported at module level so
# the type checker is happy; the runtime cost is one
# module-level lookup.
import json  # noqa: E402  (intentionally below the class so the SDK is loaded lazily)


__all__ = [
    "LLMProvider",
    "LLMResult",
    "NvidiaLLMProvider",
    "OpenAILLMProvider",
    "ToolCallRequest",
]
