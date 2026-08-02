from src.ingestion.application.chunking import (
    ChunkingConfig,
    FixedSizeChunker,
    SentenceChunker,
    StructureAwareChunker,
)


def test_fixed_size_chunker():
    config = ChunkingConfig(strategy="fixed_size", chunk_size=10, overlap=2)
    chunker = FixedSizeChunker()
    
    # 20 words = roughly 20-30 tokens
    text = "word " * 20
    chunks = chunker.chunk(text, config, initial_metadata={"source": "test"})
    
    assert len(chunks) > 1
    # Check that each chunk adheres closely to the chunk_size
    assert chunks[0]["token_count"] <= 10
    assert chunks[0]["metadata"]["source"] == "test"


def test_fixed_size_chunker_empty():
    chunker = FixedSizeChunker()
    config = ChunkingConfig(strategy="fixed_size", chunk_size=10, overlap=2)
    chunks = chunker.chunk("", config, initial_metadata={})
    assert len(chunks) == 0


def test_sentence_chunker():
    config = ChunkingConfig(strategy="sentence", chunk_size=15, overlap=0)
    chunker = SentenceChunker()
    
    text = "This is sentence one. This is sentence two! And here is three."
    chunks = chunker.chunk(text, config, initial_metadata={"source": "test"})
    
    assert len(chunks) > 0
    assert "This is sentence one." in chunks[0]["content"]


def test_sentence_chunker_empty():
    chunker = SentenceChunker()
    config = ChunkingConfig(strategy="sentence", chunk_size=15, overlap=0)
    chunks = chunker.chunk("", config, initial_metadata={})
    assert len(chunks) == 0


def test_structure_aware_chunker():
    config = ChunkingConfig(strategy="structure_aware", chunk_size=50, overlap=0)
    chunker = StructureAwareChunker()
    
    text = """# Architecture
This is a paragraph about architecture.

## Ingestion Pipeline
This is about ingestion.

### Retry Handling
Retry is important.
"""
    chunks = chunker.chunk(text, config, initial_metadata={})
    
    assert len(chunks) > 0
    # The final chunk about Retry Handling should have the full path
    last_chunk = chunks[-1]
    assert last_chunk["metadata"]["heading_path"] == [
        "Architecture", 
        "Ingestion Pipeline", 
        "Retry Handling"
    ]


def test_structure_aware_chunker_empty():
    chunker = StructureAwareChunker()
    config = ChunkingConfig(strategy="structure", chunk_size=50, overlap=0)
    chunks = chunker.chunk("", config, initial_metadata={})
    assert len(chunks) == 0
