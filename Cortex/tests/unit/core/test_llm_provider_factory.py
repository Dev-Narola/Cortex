"""
Tests for the conversation-context LLM provider factory
(``get_conversation_llm_provider`` in
``src.core.dependencies``).

The factory is the single seam that switches between
the OpenAI and NVIDIA adapters based on
``settings.LLM_PROVIDER``. These tests pin the
routing so a future provider addition doesn't break
the contract.
"""

from __future__ import annotations

import pytest

from src.core.config import Settings
from src.core.dependencies import get_conversation_llm_provider


def _with_settings(**overrides: str) -> Settings:
    """Build a fresh ``Settings`` with the given
    overrides. ``get_conversation_llm_provider`` reads
    from the global ``settings`` instance, so tests
    that need to exercise the factory route must
    monkey-patch the underlying providers.
    """
    return Settings(**overrides)  # type: ignore[arg-type]


class TestConversationLLMProviderFactory:
    def test_openai_route(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """``LLM_PROVIDER=openai`` returns the
        :class:`OpenAIProvider`.
        """
        from src.core import dependencies as deps_mod
        from src.conversation.infrastructure.llm.openai import (
            OpenAIProvider,
        )

        monkeypatch.setattr(
            deps_mod,
            "settings",
            _with_settings(
                LLM_PROVIDER="openai",
                OPENAI_API_KEY="sk-test",
            ),
        )
        provider = get_conversation_llm_provider()
        assert isinstance(provider, OpenAIProvider)

    def test_nvidia_route(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """``LLM_PROVIDER=nvidia`` returns the
        :class:`NVIDIAProvider`.
        """
        from src.core import dependencies as deps_mod
        from src.conversation.infrastructure.llm.nvidia import (
            NVIDIAProvider,
        )

        monkeypatch.setattr(
            deps_mod,
            "settings",
            _with_settings(
                LLM_PROVIDER="nvidia",
                NVIDIA_API_KEY="nvapi-test",
                NVIDIA_BASE_URL="https://example/v1",
                NVIDIA_MODEL="openai/gpt-oss-20b",
            ),
        )
        provider = get_conversation_llm_provider()
        assert isinstance(provider, NVIDIAProvider)

    def test_unknown_provider_raises(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from src.core import dependencies as deps_mod

        monkeypatch.setattr(
            deps_mod,
            "settings",
            _with_settings(LLM_PROVIDER="not-a-real-provider"),
        )
        with pytest.raises(ValueError, match="unknown LLM_PROVIDER"):
            get_conversation_llm_provider()

    def test_provider_switch_is_a_pure_config_change(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """The same code path (``get_conversation_llm_provider``)
        returns the OpenAI provider for one config and
        the NVIDIA provider for another. No code change
        is required to swap — that's the whole point
        of the factory.
        """
        from src.core import dependencies as deps_mod
        from src.conversation.infrastructure.llm.nvidia import (
            NVIDIAProvider,
        )
        from src.conversation.infrastructure.llm.openai import (
            OpenAIProvider,
        )

        monkeypatch.setattr(
            deps_mod,
            "settings",
            _with_settings(
                LLM_PROVIDER="openai", OPENAI_API_KEY="sk"
            ),
        )
        assert isinstance(
            get_conversation_llm_provider(), OpenAIProvider
        )
        monkeypatch.setattr(
            deps_mod,
            "settings",
            _with_settings(
                LLM_PROVIDER="nvidia",
                NVIDIA_API_KEY="nv",
            ),
        )
        assert isinstance(
            get_conversation_llm_provider(), NVIDIAProvider
        )
