"""
Conversation domain ports (abstract interfaces).
"""

from __future__ import annotations

from typing import Protocol, AsyncGenerator
from src.conversation.domain.entities import Message

class LLMProvider(Protocol):
    """Contract for LLM interaction."""

    async def complete(
        self,
        messages: list[Message],
        model: str,
        temperature: float = 0.7,
    ) -> str:
        """Get a complete response from the LLM."""
        ...

    async def stream(
        self,
        messages: list[Message],
        model: str,
        temperature: float = 0.7,
    ) -> AsyncGenerator[str, None]:
        """Stream response tokens from the LLM."""
        ...
