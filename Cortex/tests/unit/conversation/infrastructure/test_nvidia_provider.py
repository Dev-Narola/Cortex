"""
Tests for the ``NVIDIAProvider`` (V11 NVIDIA migration).

Covers:
   - constructor defaults + overrides
   - message formatting
   - ``complete`` invokes the OpenAI-compatible
     client with the right model + temperature
   - ``stream`` yields token deltas
   - error path: the underlying SDK error
     propagates

Tests mirror the same behavioural contract the
existing ``OpenAIProvider`` exposes — the same
test class structure could be parametrised over
both adapters once we have provider contract
tests, but for now we keep them simple.

The OpenAI SDK is mocked so no real network call
is made.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.conversation.domain.entities import (
    Message,
    MessageRole,
)
from src.conversation.infrastructure.llm.nvidia import (
    NVIDIAProvider,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


_TENANT = uuid.UUID("00000000-0000-0000-0000-000000000001")
_CONV = uuid.UUID("00000000-0000-0000-0000-000000000002")
_MSG = uuid.UUID("00000000-0000-0000-0000-000000000003")


def make_message(role: str, content: str) -> Message:
    return Message(
        id=_MSG,
        conversation_id=_CONV,
        tenant_id=_TENANT,
        role=role,
        content=content,
        token_count=0,
        retrieved_chunk_ids=(),
        model_name=None,
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )


def fake_completion(content: str) -> SimpleNamespace:
    """A minimal stand-in for the OpenAI completion object."""
    return SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(content=content)
            )
        ]
    )


# ---------------------------------------------------------------------------
# Construction
# ---------------------------------------------------------------------------


class TestNvidiaProviderConstruction:
    def test_uses_provided_api_key(self) -> None:
        p = NVIDIAProvider(api_key="explicit-key")
        # The client's api_key is exposed via the
        # underlying ``AsyncOpenAI``; we just want
        # to confirm the explicit value is
        # honoured over settings.NVIDIA_API_KEY.
        assert p._client.api_key == "explicit-key"

    def test_uses_default_model(self) -> None:
        p = NVIDIAProvider(api_key="k")
        # The default is whatever ``settings.NVIDIA_MODEL``
        # resolves to. The production default is
        # ``openai/gpt-oss-20b`` (set in
        # ``src/core/config.py``).
        assert p.model

    def test_uses_provided_model(self) -> None:
        p = NVIDIAProvider(
            api_key="k", model="openai/gpt-oss-120b"
        )
        assert p.model == "openai/gpt-oss-120b"

    def test_uses_provided_base_url(self) -> None:
        p = NVIDIAProvider(
            api_key="k",
            base_url="https://custom.api.nvidia.com/v1",
        )
        # The OpenAI SDK normalises the URL by
        # adding a trailing slash; compare the
        # host + path so the test isn't brittle.
        assert (
            str(p._client.base_url).rstrip("/")
            == "https://custom.api.nvidia.com/v1"
        )

    def test_uses_provided_temperature(self) -> None:
        p = NVIDIAProvider(api_key="k", temperature=0.7)
        assert p.temperature == 0.7

    def test_uses_provided_max_tokens(self) -> None:
        p = NVIDIAProvider(api_key="k", max_tokens=2048)
        assert p.max_tokens == 2048


# ---------------------------------------------------------------------------
# complete()
# ---------------------------------------------------------------------------


class TestNvidiaProviderComplete:
    @pytest.mark.asyncio
    async def test_returns_assistant_content(self) -> None:
        p = NVIDIAProvider(api_key="k")
        with patch.object(
            p._client.chat.completions,
            "create",
            new=AsyncMock(
                return_value=fake_completion("hello world")
            ),
        ) as mock_create:
            result = await p.complete(
                [make_message("user", "hi")]
            )
        assert result == "hello world"
        mock_create.assert_awaited_once()
        kwargs = mock_create.await_args.kwargs
        # The model is whatever ``p.model`` is
        # (default from settings); we just
        # confirm the provider passed a model.
        assert "model" in kwargs
        assert kwargs["max_tokens"] == p.max_tokens

    @pytest.mark.asyncio
    async def test_formats_messages(self) -> None:
        """The provider must translate
        :class:`Message` into the dict shape NIM
        (and OpenAI) expect.
        """
        p = NVIDIAProvider(api_key="k")
        with patch.object(
            p._client.chat.completions,
            "create",
            new=AsyncMock(
                return_value=fake_completion("ok")
            ),
        ) as mock_create:
            await p.complete(
                [
                    make_message("user", "u1"),
                    make_message("assistant", "a1"),
                    make_message("user", "u2"),
                ]
            )
        kwargs = mock_create.await_args.kwargs
        assert kwargs["messages"] == [
            {"role": "user", "content": "u1"},
            {"role": "assistant", "content": "a1"},
            {"role": "user", "content": "u2"},
        ]

    @pytest.mark.asyncio
    async def test_propagates_sdk_errors(self) -> None:
        p = NVIDIAProvider(api_key="k")
        with patch.object(
            p._client.chat.completions,
            "create",
            new=AsyncMock(
                side_effect=RuntimeError("nvidia down")
            ),
        ):
            with pytest.raises(RuntimeError, match="nvidia down"):
                await p.complete(
                    [make_message("user", "hi")]
                )

    @pytest.mark.asyncio
    async def test_handles_empty_content(self) -> None:
        """A completion that returns no content
        should not crash; the provider returns
        an empty string.
        """
        p = NVIDIAProvider(api_key="k")
        with patch.object(
            p._client.chat.completions,
            "create",
            new=AsyncMock(
                return_value=fake_completion("")
            ),
        ):
            result = await p.complete(
                [make_message("user", "hi")]
            )
        assert result == ""


# ---------------------------------------------------------------------------
# stream()
# ---------------------------------------------------------------------------


class TestNvidiaProviderStream:
    @pytest.mark.asyncio
    async def test_yields_token_deltas(self) -> None:
        async def fake_stream():
            for content in ["Hello", " ", "world", "!"]:
                yield SimpleNamespace(
                    choices=[
                        SimpleNamespace(
                            delta=SimpleNamespace(
                                content=content
                            )
                        )
                    ]
                )
            # An empty chunk with no choices is
            # silently skipped (the provider
            # guards on ``if not chunk.choices``).
            yield SimpleNamespace(choices=[])

        p = NVIDIAProvider(api_key="k")
        with patch.object(
            p._client.chat.completions,
            "create",
            new=AsyncMock(return_value=fake_stream()),
        ):
            tokens: list[str] = []
            async for token in p.stream(
                [make_message("user", "hi")]
            ):
                tokens.append(token)
        assert tokens == ["Hello", " ", "world", "!"]

    @pytest.mark.asyncio
    async def test_stream_passes_stream_true(self) -> None:
        p = NVIDIAProvider(api_key="k")
        with patch.object(
            p._client.chat.completions,
            "create",
            new=AsyncMock(
                return_value=fake_stream_empty()
                if False
                else AsyncMock(return_value=_empty_async_iter())
            ),
        ) as mock_create:
            async for _ in p.stream(
                [make_message("user", "hi")]
            ):
                pass
        kwargs = mock_create.await_args.kwargs
        assert kwargs.get("stream") is True


def fake_stream_empty():
    """A sync helper for an empty async stream."""
    async def _iter():
        if False:
            yield  # pragma: no cover
    return _iter()


async def _empty_async_iter():
    if False:
        yield  # pragma: no cover


# ---------------------------------------------------------------------------
# Format helper
# ---------------------------------------------------------------------------


class TestNvidiaProviderFormat:
    def test_format_normalises_role_enum(self) -> None:
        out = NVIDIAProvider._format(
            [
                make_message("user", "u"),
                make_message("assistant", "a"),
            ]
        )
        assert out == [
            {"role": "user", "content": "u"},
            {"role": "assistant", "content": "a"},
        ]
