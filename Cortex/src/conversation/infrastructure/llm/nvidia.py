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

from src.conversation.infrastructure.llm.openai import OpenAIProvider
from src.core.config import settings


class NVIDIAProvider(OpenAIProvider):
    """
    NVIDIA NIM adapter: the OpenAI adapter pointed at NIM's base URL,
    ``NVIDIA_API_KEY`` and ``NVIDIA_MODEL``. Completion, streaming and
    usage capture are inherited unchanged.
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
        super().__init__(
            # "dummy" only lets unit tests construct it offline; prod needs the real key.
            api_key=api_key or settings.NVIDIA_API_KEY or "dummy-key-for-tests",
            model=model or settings.NVIDIA_MODEL,
            base_url=base_url or settings.NVIDIA_BASE_URL,
            temperature=temperature,
            timeout=timeout,
            max_tokens=max_tokens,
        )
        self.provider = "nvidia"


__all__ = ["NVIDIAProvider"]
