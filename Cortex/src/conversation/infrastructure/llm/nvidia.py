"""
NVIDIA NIM implementation of the ``LLMProvider`` port.

NVIDIA's hosted inference endpoint (``integrate.api.nvidia.com``)
exposes an OpenAI-compatible REST surface — same
``/v1/chat/completions`` shape, same streaming SSE protocol, same
tool-calling conventions. That means we can implement the
:mod:`src.conversation.domain.ports.LLMProvider` contract by
pointing the existing ``openai`` Python SDK at NVIDIA's
``base_url``, without introducing a new SDK.

**Why not a separate SDK.** The OpenAI Python client is already a
hard dependency of Cortex (the V3 ``OpenAIProvider`` uses it).
Reusing it as an HTTP client for the NIM endpoint keeps the
dependency footprint small and the streaming semantics identical.
The provider swap is a config change (``LLM_PROVIDER=nvidia``),
not a new vendor lock-in.

**Reasoning content.** NVIDIA-hosted "reasoning" models (e.g.
``openai/gpt-oss-20b``) attach a separate ``reasoning_content``
field to the assistant message. Today the chat and agent loops
ignore it — only ``content`` is read — which is the correct
behaviour for a general chat surface. The field is preserved in
the raw ``LLMResult``-shaped log payload for future V4 work
that wants to surface the model's reasoning.

**Tenant isolation.** Tenant boundaries are enforced by the
application/retrieval layer (the LLM provider itself has no
notion of tenant). The provider is purely a thin client
adapter.

**Auth.** The provider reads ``NVIDIA_API_KEY`` from
``src.core.config.settings``. The key is supplied through
``start.sh``'s secrets render in production so it never reaches
the container layer or Git.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator

from openai import AsyncOpenAI

from src.conversation.domain.entities import Message
from src.conversation.domain.ports import LLMProvider
from src.core.config import settings

logger = logging.getLogger(__name__)


class NVIDIAProvider(LLMProvider):
    """
    NVIDIA NIM ``AsyncOpenAI`` adapter for Cortex.

    Behaves exactly like :class:`OpenAIProvider` from the
    application's point of view; the only differences are the
    ``base_url`` (NVIDIA's NIM endpoint), the api key
    (``NVIDIA_API_KEY``), and the model default
    (``openai/gpt-oss-20b``). The constructor signature mirrors
    :class:`OpenAIProvider` so unit tests can parametrise the
    same behavioural contract over both adapters.
    """

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str | None = None,
        base_url: str | None = None,
        temperature: float | None = None,
        timeout: float | None = None,
        max_tokens: int | None = None,
    ) -> None:
        self._client = AsyncOpenAI(
            # The NIM endpoint requires an api key. We
            # fall back to ``"dummy"`` only so unit
            # tests that never actually call the network
            # can construct the adapter without a real
            # secret; the production path requires a
            # real ``NVIDIA_API_KEY``.
            api_key=api_key
            or settings.NVIDIA_API_KEY
            or "dummy-key-for-tests",
            base_url=base_url or settings.NVIDIA_BASE_URL,
            timeout=timeout if timeout is not None else settings.LLM_TIMEOUT,
        )
        self.model = model or settings.NVIDIA_MODEL
        self.temperature = (
            temperature if temperature is not None else settings.LLM_TEMPERATURE
        )
        self.max_tokens = (
            max_tokens if max_tokens is not None else settings.LLM_MAX_TOKENS
        )

    # ------------------------------------------------------------------
    # LLMProvider
    # ------------------------------------------------------------------

    async def complete(
        self,
        messages: list[Message],
        model: str | None = None,
        temperature: float | None = None,
    ) -> str:
        """Run a non-streaming chat completion via NIM."""
        response = await self._client.chat.completions.create(
            model=model or self.model,
            messages=self._format(messages),
            temperature=temperature if temperature is not None else self.temperature,
            max_tokens=self.max_tokens,
        )
        choice = response.choices[0]
        return (choice.message.content or "").strip()

    async def stream(
        self,
        messages: list[Message],
        model: str | None = None,
        temperature: float | None = None,
    ) -> AsyncGenerator[str, None]:
        """Stream token deltas from a NIM chat completion."""
        stream = await self._client.chat.completions.create(
            model=model or self.model,
            messages=self._format(messages),
            temperature=temperature if temperature is not None else self.temperature,
            max_tokens=self.max_tokens,
            stream=True,
        )
        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            token = delta.content if delta and delta.content else None
            if token:
                yield token

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    @staticmethod
    def _format(messages: list[Message]) -> list[dict]:
        """
        Convert :class:`Message` dataclasses into the dict shape
        NIM (and OpenAI) expect. Same rules as
        :meth:`OpenAIProvider._format` — the dataclass ``role``
        is normalised to a string, ``content`` is taken verbatim.
        """
        out: list[dict] = []
        for m in messages:
            role = m.role.value if hasattr(m.role, "value") else str(m.role)
            out.append({"role": role, "content": m.content})
        return out


__all__ = ["NVIDIAProvider"]
