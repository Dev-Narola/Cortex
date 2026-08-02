from typing import Protocol


class EmbeddingProvider(Protocol):
    """
    Abstract interface for generating vector embeddings from text.
    
    The implementation is responsible for batching, retry logic, 
    and interacting with the underlying model provider (e.g. OpenAI, Cohere, local).
    """

    async def embed_text(self, text: str) -> list[float]:
        """
        Generate an embedding vector for a single string.
        """
        ...

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """
        Generate embedding vectors for a list of strings.
        """
        ...
