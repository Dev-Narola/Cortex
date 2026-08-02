"""
Unit tests for the V3 ``OpenAIEmbeddingProvider``.

The tests are structured so the provider can be exercised without
hitting the real OpenAI API: we monkey-patch the underlying
``AsyncOpenAI`` client and assert the right *flow* — empty-input
rejection, batched request, dimension check, error classification.
"""

from __future__ import annotations

import uuid
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.embedding.domain.errors import (
    PermanentEmbeddingError,
    TransientEmbeddingError,
)
from src.embedding.domain.ports import EmbeddingProvider
from src.embedding.infrastructure.providers.openai import OpenAIEmbeddingProvider


def _fake_response(vectors: list[list[float]]):
    """Build a mock object shaped like ``openai.Embedding.create``'s return."""
    resp = MagicMock()
    resp.data = [
        MagicMock(index=i, embedding=vec) for i, vec in enumerate(vectors)
    ]
    return resp


class TestProviderContract:
    """The provider must satisfy the ``EmbeddingProvider`` port
    structurally — the protocol is enforced by ``Protocol`` so
    the import-time attribute check is enough."""

    def test_has_required_methods(self):
        provider = OpenAIEmbeddingProvider(api_key="dummy")
        assert callable(getattr(provider, "embed_text", None))
        assert callable(getattr(provider, "embed_batch", None))

    @pytest.mark.asyncio
    async def test_empty_text_is_permanent_error(self):
        provider = OpenAIEmbeddingProvider(api_key="dummy")
        with pytest.raises(PermanentEmbeddingError):
            await provider.embed_text("")

    @pytest.mark.asyncio
    async def test_whitespace_text_is_permanent_error(self):
        provider = OpenAIEmbeddingProvider(api_key="dummy")
        with pytest.raises(PermanentEmbeddingError):
            await provider.embed_text("   \n\t  ")


class TestBatchingAndCache:
    """The provider must look up cache, batch misses, and write back."""

    @pytest.mark.asyncio
    async def test_batched_request_returns_vectors_in_order(self):
        # Use a tiny dimension to keep the fake response small;
        # ``self.dimensions`` is the authority for the dimension
        # check, and we set it explicitly here.
        provider = OpenAIEmbeddingProvider(
            api_key="dummy", dimensions=3, use_cache=False
        )
        provider._client = MagicMock()
        provider._client.embeddings.create = AsyncMock(
            return_value=_fake_response([[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]])
        )
        result = await provider.embed_batch(["a", "b"])
        assert result == [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]
        # Single batched call (not two per-chunk calls).
        provider._client.embeddings.create.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_empty_batch_returns_empty(self):
        provider = OpenAIEmbeddingProvider(api_key="dummy")
        result = await provider.embed_batch([])
        assert result == []

    @pytest.mark.asyncio
    async def test_wrong_dimension_raises_permanent(self):
        """A provider that returns the wrong-length vector must
        fail loudly as a permanent error so we never write bad
        data."""
        provider = OpenAIEmbeddingProvider(
            api_key="dummy", dimensions=4, use_cache=False
        )
        provider._client = MagicMock()
        provider._client.embeddings.create = AsyncMock(
            return_value=_fake_response([[0.1, 0.2, 0.3]])  # len 3 vs 4
        )
        with pytest.raises(PermanentEmbeddingError):
            await provider.embed_batch(["hello"])


class TestErrorClassification:
    """Error → ``Transient`` / ``Permanent`` mapping per the V3 spec."""

    @pytest.mark.asyncio
    async def test_authentication_error_is_permanent(self):
        provider = OpenAIEmbeddingProvider(api_key="bad", use_cache=False)
        provider._client = MagicMock()
        from openai import AuthenticationError

        err = AuthenticationError(
            message="bad key",
            response=MagicMock(status_code=401),
            body={},
        )
        provider._client.embeddings.create = AsyncMock(side_effect=err)
        with pytest.raises(PermanentEmbeddingError):
            await provider.embed_batch(["hello"])

    @pytest.mark.asyncio
    async def test_rate_limit_error_is_transient(self):
        provider = OpenAIEmbeddingProvider(api_key="dummy", use_cache=False)
        provider._client = MagicMock()
        from openai import RateLimitError

        err = RateLimitError(
            message="too many",
            response=MagicMock(status_code=429),
            body={},
        )
        provider._client.embeddings.create = AsyncMock(side_effect=err)
        with pytest.raises(TransientEmbeddingError):
            await provider.embed_batch(["hello"])

    @pytest.mark.asyncio
    async def test_bad_request_is_permanent(self):
        provider = OpenAIEmbeddingProvider(api_key="dummy", use_cache=False)
        provider._client = MagicMock()
        from openai import BadRequestError

        err = BadRequestError(
            message="bad input",
            response=MagicMock(status_code=400),
            body={},
        )
        provider._client.embeddings.create = AsyncMock(side_effect=err)
        with pytest.raises(PermanentEmbeddingError):
            await provider.embed_batch(["hello"])


__all__: list[Any] = []
