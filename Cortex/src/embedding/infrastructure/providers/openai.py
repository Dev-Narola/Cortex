"""
OpenAI implementation of the ``EmbeddingProvider`` port.

A note on caching: this provider is the boundary between the
rest of the system and the network. The application layer
(``EmbedDocumentChunksService``) already calls the provider in
batches, but identical content can still be sent twice (e.g.
overlapping chunks from two documents). Rather than re-hitting
the API, we look the SHA-256 of each input in Redis first.
Misses are sent in a single batched request, then cached.

Cache key format: ``emb:{model}:{sha256(content)}``. The model
name is in the key so swapping models does not poison old vectors.
"""

from __future__ import annotations

import hashlib
import json
import logging
from typing import Any, Iterable

from openai import AsyncOpenAI
from openai import APIError as _OpenAIAPIError
from openai import (
    APIStatusError,
    APITimeoutError,
    AuthenticationError,
    BadRequestError,
    RateLimitError,
)

from src.embedding.domain.errors import PermanentEmbeddingError, TransientEmbeddingError
from src.embedding.domain.ports import EmbeddingProvider
from src.core.config import settings
from src.core.redis_client import get_redis

logger = logging.getLogger(__name__)


# HTTP-ish codes attached to the BaseAppException contract. The
# platform exception handler reads ``exc.code`` to set the response
# status, so we use real codes instead of magic numbers.
_BAD_REQUEST = 400
_INTERNAL = 500


def _content_hash(text: str) -> str:
    """Stable SHA-256 of ``text`` used as the cache key suffix."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class OpenAIEmbeddingProvider(EmbeddingProvider):
    """
    OpenAI-compatible embedding provider.

    Works with the OpenAI ``text-embedding-3-*`` family and with any
    OpenAI-compatible endpoint (NVIDIA NIM, Azure OpenAI, local servers).

    ``dimensions`` is the authoritative expected vector length. After every
    API call the returned vector length is compared against this value — a
    mismatch means the database column would receive wrong-shaped data and
    is rejected immediately as a permanent error.

    ``supports_dimensions`` controls whether the ``dimensions`` kwarg is
    forwarded to the API.  OpenAI's text-embedding-3 models accept it;
    NVIDIA NIM and older OpenAI models silently ignore or reject it.
    Set this to ``False`` when pointing at a provider that fixes its output
    dimension and does not honour the parameter.
    """

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
        dimensions: int | None = None,
        supports_dimensions: bool = True,
        timeout: float | None = None,
        max_retries: int | None = None,
        use_cache: bool = True,
    ) -> None:
        self.model = model or settings.EMBEDDING_MODEL
        self.dimensions = dimensions or settings.EMBEDDING_DIMENSIONS
        self.supports_dimensions = supports_dimensions
        self.use_cache = use_cache
        client_kwargs: dict = {
            "api_key": api_key or settings.OPENAI_API_KEY or "dummy-key-for-tests",
            "timeout": timeout if timeout is not None else settings.EMBEDDING_TIMEOUT,
            "max_retries": max_retries if max_retries is not None else settings.EMBEDDING_MAX_RETRIES,
        }
        if base_url:
            client_kwargs["base_url"] = base_url
        self._client = AsyncOpenAI(**client_kwargs)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def embed_text(self, text: str) -> list[float]:
        if not text or not text.strip():
            raise PermanentEmbeddingError(
                "Cannot embed empty or whitespace-only text.",
                code=_BAD_REQUEST,
            )
        vectors = await self.embed_batch([text], input_type="query")
        return vectors[0]

    async def embed_batch(self, texts: list[str], *, input_type: str = "passage") -> list[list[float]]:
        if not texts:
            return []

        # 1) Empty-string filter — refuse to call the API on garbage.
        for t in texts:
            if not isinstance(t, str) or not t.strip():
                raise PermanentEmbeddingError(
                    "Cannot embed empty or whitespace-only text in a batch.",
                    code=_BAD_REQUEST,
                )

        # 2) Cache lookup. We always return results in the same
        #    order as the caller passed ``texts`` in.
        cached_vectors: list[list[float] | None] = [None] * len(texts)
        missing_indices: list[int] = []
        missing_texts: list[str] = []

        if self.use_cache:
            redis = None
            try:
                redis = await get_redis()
            except RuntimeError:
                # Redis not initialized (e.g. unit tests). Fall
                # back to a no-cache path; this is fine because
                # tests should not depend on Redis state.
                redis = None

            if redis is not None:
                for i, t in enumerate(texts):
                    key = self._cache_key(t)
                    try:
                        raw = await redis.get(key)
                    except Exception as exc:  # noqa: BLE001 - cache is best-effort
                        logger.warning("Embedding cache read failed (%s); bypassing.", exc)
                        raw = None
                    if raw is not None:
                        try:
                            cached_vectors[i] = _decode(raw)
                        except Exception:  # noqa: BLE001
                            # Corrupted cache entry — drop and re-embed.
                            cached_vectors[i] = None
                    if cached_vectors[i] is None:
                        missing_indices.append(i)
                        missing_texts.append(t)
            else:
                missing_indices = list(range(len(texts)))
                missing_texts = list(texts)
        else:
            missing_indices = list(range(len(texts)))
            missing_texts = list(texts)

        # 3) Call the provider for whatever the cache didn't have.
        if missing_texts:
            new_vectors = await self._call_provider(missing_texts, input_type=input_type)
            for idx, vec in zip(missing_indices, new_vectors):
                cached_vectors[idx] = vec
            if self.use_cache:
                redis = None
                try:
                    redis = await get_redis()
                except RuntimeError:
                    redis = None
                if redis is not None:
                    pipe = redis.pipeline()
                    for idx, vec in zip(missing_indices, new_vectors):
                        key = self._cache_key(texts[idx])
                        pipe.set(key, _encode(vec), ex=settings.EMBEDDING_CACHE_TTL_SECONDS)
                    try:
                        await pipe.execute()
                    except Exception as exc:  # noqa: BLE001
                        logger.warning("Embedding cache write failed (%s).", exc)

        result: list[list[float]] = [v for v in cached_vectors]  # type: ignore[misc]
        return result

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _cache_key(self, text: str) -> str:
        return f"emb:{self.model}:{_content_hash(text)}"

    async def _call_provider(self, texts: list[str], *, input_type: str = "passage") -> list[list[float]]:
        """
        Single batched call to the provider, with error classification.

        ``dimensions`` is only forwarded when ``self.supports_dimensions``
        is True — OpenAI text-embedding-3-* accepts it; NVIDIA NIM and
        older models do not.
        """
        create_kwargs: dict = {
            "model": self.model,
            "input": texts,
        }
        if "llama-3.2-nv-embedqa" in self.model:
            create_kwargs["extra_body"] = {
                "input_type": input_type,
                "truncate": "NONE",
                "dimensions": self.dimensions,
            }
        elif self.supports_dimensions:
            create_kwargs["dimensions"] = self.dimensions
        try:
            response = await self._client.embeddings.create(**create_kwargs)
        except AuthenticationError as exc:
            raise PermanentEmbeddingError(
                f"OpenAI authentication failed: {exc}",
                code=_BAD_REQUEST,
            ) from exc
        except BadRequestError as exc:
            raise PermanentEmbeddingError(
                f"OpenAI rejected the request (bad input / model / dimensions): {exc}",
                code=_BAD_REQUEST,
            ) from exc
        except (RateLimitError, APITimeoutError, APIStatusError) as exc:
            raise TransientEmbeddingError(
                f"OpenAI transient failure: {exc}",
                code=_INTERNAL,
            ) from exc
        except _OpenAIAPIError as exc:
            raise TransientEmbeddingError(
                f"OpenAI unknown API error: {exc}",
                code=_INTERNAL,
            ) from exc
        except Exception as exc:  # noqa: BLE001
            raise TransientEmbeddingError(
                f"Unexpected embedding error: {exc}",
                code=_INTERNAL,
            ) from exc

        sorted_data = sorted(response.data, key=lambda d: d.index)
        vectors: list[list[float]] = [list(d.embedding) for d in sorted_data]

        expected = self.dimensions
        for v in vectors:
            if len(v) != expected:
                raise PermanentEmbeddingError(
                    f"Provider returned vector of length {len(v)}, "
                    f"expected {expected} (model={self.model!r}). "
                    f"Check EMBEDDING_DIMENSIONS in src/core/config.py.",
                    code=_INTERNAL,
                )
        return vectors


# ---------------------------------------------------------------------------
# Cache encoding helpers
# ---------------------------------------------------------------------------


def _encode(vec: list[float]) -> str:
    return json.dumps(vec, separators=(",", ":"))


def _decode(raw: str | bytes) -> list[float]:
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    data = json.loads(raw)
    if not isinstance(data, list):
        raise ValueError("cached value is not a list")
    return [float(x) for x in data]


_ = Iterable
_ = Any
