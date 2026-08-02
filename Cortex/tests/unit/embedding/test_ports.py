import pytest
from src.embedding.domain.ports import EmbeddingProvider

class DummyProvider(EmbeddingProvider):
    async def embed_text(self, text: str) -> list[float]:
        return [0.1, 0.2, 0.3]
        
    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        return [[0.1, 0.2, 0.3] for _ in texts]

@pytest.mark.asyncio
async def test_embedding_provider_protocol():
    provider = DummyProvider()
    result = await provider.embed_text("test")
    assert result == [0.1, 0.2, 0.3]
    
    batch_result = await provider.embed_batch(["test1", "test2"])
    assert len(batch_result) == 2
    assert batch_result[0] == [0.1, 0.2, 0.3]
