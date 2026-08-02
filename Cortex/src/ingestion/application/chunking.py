"""
Chunking strategies for the ingestion pipeline.
"""
import re
from abc import ABC, abstractmethod
from typing import List

import tiktoken
from pydantic import BaseModel


class ChunkingConfig(BaseModel):
    strategy: str = "fixed_size"
    chunk_size: int = 1000
    overlap: int = 150


class ChunkingStrategy(ABC):
    """Abstract interface for all chunking strategies."""
    
    def __init__(self):
        self.encoder = tiktoken.get_encoding("cl100k_base")
        
    def count_tokens(self, text: str) -> int:
        return len(self.encoder.encode(text, disallowed_special=()))

    @abstractmethod
    def chunk(self, text: str, config: ChunkingConfig, initial_metadata: dict) -> List[dict]:
        """
        Produce chunks from text.
        
        Returns a list of dicts:
        [
            {
                "content": str,
                "token_count": int,
                "metadata": dict
            }
        ]
        """
        pass


class FixedSizeChunker(ChunkingStrategy):
    """
    Chunks text strictly by token size with a fixed overlap.
    """
    def chunk(self, text: str, config: ChunkingConfig, initial_metadata: dict) -> List[dict]:
        tokens = self.encoder.encode(text, disallowed_special=())
        
        chunks = []
        start = 0
        while start < len(tokens):
            end = start + config.chunk_size
            chunk_tokens = tokens[start:end]
            chunk_text = self.encoder.decode(chunk_tokens)
            
            chunks.append({
                "content": chunk_text,
                "token_count": len(chunk_tokens),
                "metadata": initial_metadata.copy()
            })
            
            if end >= len(tokens):
                break
                
            start += config.chunk_size - config.overlap
            
        return chunks


class SentenceChunker(ChunkingStrategy):
    """
    Chunks text by sentences, accumulating them until the chunk_size is reached.
    """
    def chunk(self, text: str, config: ChunkingConfig, initial_metadata: dict) -> List[dict]:
        sentences = re.split(r'(?<=[.!?])\s+', text)
        
        chunks = []
        current_chunk_text = ""
        current_token_count = 0
        
        for sentence in sentences:
            if not sentence.strip():
                continue
                
            sentence_tokens = self.count_tokens(sentence)
            
            if current_token_count + sentence_tokens > config.chunk_size and current_chunk_text:
                chunks.append({
                    "content": current_chunk_text.strip(),
                    "token_count": current_token_count,
                    "metadata": initial_metadata.copy()
                })
                current_chunk_text = sentence + " "
                current_token_count = sentence_tokens
            else:
                current_chunk_text += sentence + " "
                current_token_count += sentence_tokens
                
        if current_chunk_text.strip():
            chunks.append({
                "content": current_chunk_text.strip(),
                "token_count": self.count_tokens(current_chunk_text.strip()),
                "metadata": initial_metadata.copy()
            })
            
        return chunks


class StructureAwareChunker(ChunkingStrategy):
    """
    Chunks Markdown/structured text, tracking the heading path.
    """
    def chunk(self, text: str, config: ChunkingConfig, initial_metadata: dict) -> List[dict]:
        lines = text.split('\n')
        
        chunks = []
        current_heading_path = []
        current_chunk_text = ""
        current_token_count = 0
        
        for line in lines:
            header_match = re.match(r'^(#+)\s+(.*)', line)
            if header_match:
                level = len(header_match.group(1))
                heading = header_match.group(2).strip()
                
                if current_chunk_text.strip():
                    metadata = initial_metadata.copy()
                    if current_heading_path:
                        metadata["heading_path"] = list(current_heading_path)
                    chunks.append({
                        "content": current_chunk_text.strip(),
                        "token_count": current_token_count,
                        "metadata": metadata
                    })
                    current_chunk_text = ""
                    current_token_count = 0
                    
                current_heading_path = current_heading_path[:level]
                if len(current_heading_path) < level:
                    # Pad missing levels if markdown jumps from H1 to H3
                    current_heading_path.extend([""] * (level - len(current_heading_path) - 1))
                    current_heading_path.append(heading)
                else:
                    current_heading_path[level-1] = heading
                
            line_tokens = self.count_tokens(line + "\n")
            
            if current_token_count + line_tokens > config.chunk_size and current_chunk_text.strip():
                metadata = initial_metadata.copy()
                if current_heading_path:
                    metadata["heading_path"] = list(current_heading_path)
                chunks.append({
                    "content": current_chunk_text.strip(),
                    "token_count": current_token_count,
                    "metadata": metadata
                })
                current_chunk_text = line + "\n"
                current_token_count = line_tokens
            else:
                current_chunk_text += line + "\n"
                current_token_count += line_tokens
                
        if current_chunk_text.strip():
            metadata = initial_metadata.copy()
            if current_heading_path:
                metadata["heading_path"] = list(current_heading_path)
            chunks.append({
                "content": current_chunk_text.strip(),
                "token_count": self.count_tokens(current_chunk_text.strip()),
                "metadata": metadata
            })
            
        return chunks
