"""Embedding provider adapters.

A provider is the only thing in the system that talks to a third-party
embedding API. The application layer depends on the abstract
``EmbeddingProvider`` port, not on these concrete classes.

``build_embedding_provider`` is the single factory used by BOTH the
ingestion worker (passages) and the search path (queries) — the two
must embed into the same vector space, so there is exactly one place
that decides the provider, model, and dimension.
"""

from __future__ import annotations

from src.core.config import settings


def build_embedding_provider():
    """Return the provider selected by ``EMBEDDING_PROVIDER`` (``openai`` | ``nvidia``)."""
    from src.embedding.infrastructure.providers.openai import OpenAIEmbeddingProvider

    provider = (settings.EMBEDDING_PROVIDER or "openai").lower()
    if provider == "openai":
        return OpenAIEmbeddingProvider()
    if provider == "nvidia":
        if not settings.NVIDIA_API_KEY:
            raise ValueError("EMBEDDING_PROVIDER=nvidia requires NVIDIA_API_KEY to be set.")
        return OpenAIEmbeddingProvider(
            api_key=settings.NVIDIA_API_KEY,
            base_url=settings.NVIDIA_BASE_URL,
            model=settings.NVIDIA_EMBEDDING_MODEL,
            # NIM models have a fixed output size; ``dimensions`` is only validated.
            supports_dimensions=False,
            nim=True,
        )
    raise ValueError(
        f"Unknown embedding provider: {settings.EMBEDDING_PROVIDER!r}. "
        "Supported: 'openai', 'nvidia'."
    )


__all__ = ["build_embedding_provider"]
