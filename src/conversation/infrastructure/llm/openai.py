"""
OpenAI implementation of the ``LLMProvider`` port.

The provider wraps ``AsyncOpenAI`` so it integrates cleanly with
the rest of the V3 async pipeline. The default model, temperature,
and timeout all come from ``src.core.config.settings`` so
swapping providers/models is a config change rather than a code
change.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator

from openai import AsyncOpenAI

from src.conversation.domain.entities import Message
from src.conversation.domain.ports import LLMProvider
from src.core.config import settings

logger = logging.getLogger(__name__)


class OpenAIProvider(LLMProvider):
    """
    OpenAI ``AsyncOpenAI`` adapter for Cortex.

    ``complete`` runs a single, non-streaming chat completion.
    ``stream`` yields token strings as they arrive. Both methods
    normalise the message list to OpenAI's dict shape and apply
    the configured model + temperature + timeout.
    """

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str | None = None,
        temperature: float | None = None,
        timeout: float | None = None,
        max_tokens: int | None = None,
    ) -> None:
        self._client = AsyncOpenAI(
            api_key=api_key or settings.OPENAI_API_KEY or "dummy-key-for-tests",
            timeout=timeout if timeout is not None else settings.LLM_TIMEOUT,
        )
        self.model = model or settings.LLM_MODEL
        self.temperature = (
            temperature if temperature is not None else settings.LLM_TEMPERATURE
        )
        self.max_tokens = max_tokens if max_tokens is not None else settings.LLM_MAX_TOKENS

    # ------------------------------------------------------------------
    # LLMProvider
    # ------------------------------------------------------------------

    async def complete(
        self,
        messages: list[Message],
        model: str | None = None,
        temperature: float | None = None,
    ) -> str:
        """Run a non-streaming chat completion."""
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
        """Stream token deltas from a chat completion."""
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
        Convert our ``Message`` dataclasses into the dict shape
        OpenAI's API expects. The dataclass ``role`` is either a
        ``MessageRole`` enum or the raw string value; we
        normalise to the string the API accepts.
        """
        out: list[dict] = []
        for m in messages:
            role = m.role.value if hasattr(m.role, "value") else str(m.role)
            out.append({"role": role, "content": m.content})
        return out


__all__ = ["OpenAIProvider"]
