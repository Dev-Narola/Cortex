import logging
import uuid

from src.embedding.domain.errors import PermanentEmbeddingError, TransientEmbeddingError
from src.embedding.domain.ports import EmbeddingProvider
from src.ingestion.infrastructure.chunk_repository import ChunkRepository
from src.core.config import settings
from src.observability.application.billable import BillableRecorder

logger = logging.getLogger(__name__)

class EmbedDocumentChunksService:
    """
    Application service that batches unembedded chunks for a document,
    requests vectors from the embedding provider, and updates the chunks.
    """

    def __init__(
        self,
        provider: EmbeddingProvider,
        chunk_repo: ChunkRepository,
        billable: BillableRecorder | None = None,
    ):
        self.provider = provider
        self.chunk_repo = chunk_repo
        # V4: optional usage-event recorder. The default
        # (``None``) is the unit-test path; production
        # passes a real :class:`BillableRecorder` wired to
        # the billing pipeline.
        self._billable = billable

    async def embed_document(self, document_id: uuid.UUID, tenant_id: uuid.UUID) -> int:
        """
        Embed all unembedded chunks for the document.
        Returns the number of chunks embedded.
        """
        batch_size = settings.EMBEDDING_BATCH_SIZE
        model_name = settings.EMBEDDING_MODEL
        version = "1"  # Or extract from a deeper config if necessary
        
        total_embedded = 0

        while True:
            chunks = self.chunk_repo.get_unembedded_chunks(
                document_id, tenant_id=tenant_id, limit=batch_size
            )
            
            if not chunks:
                break
                
            texts = [chunk.content for chunk in chunks]
            
            try:
                vectors = await self.provider.embed_batch(texts)
            except (TransientEmbeddingError, PermanentEmbeddingError):
                raise
            except Exception as e:
                # Wrap unexpected provider errors as transient so they retry by default
                logger.exception("Unexpected error calling embedding provider")
                raise TransientEmbeddingError(
                    f"Unexpected provider error: {e}", code=500
                ) from e

            if len(vectors) != len(chunks):
                raise PermanentEmbeddingError(
                    f"Provider returned {len(vectors)} vectors, expected {len(chunks)}",
                    code=400,
                )
                
            updates = []
            for chunk, vector in zip(chunks, vectors):
                updates.append({
                    "id": chunk.id,
                    "embedding": vector,
                    "embedding_model": model_name,
                    "embedding_version": version,
                })
                
            self.chunk_repo.update_chunk_embeddings(
                document_id=document_id,
                tenant_id=tenant_id,
                updates=updates
            )
            
            total_embedded += len(updates)
            logger.info(f"Embedded batch of {len(updates)} chunks for document {document_id}")

            # V4: emit a usage event for the embedding batch.
            # Token count is a tiktoken estimate — the OpenAI
            # ``embeddings.create`` response does not return
            # ``usage`` for the embedding endpoint in the
            # public SDK, so we use a conservative 4-chars-
            # per-token estimate. This is good enough for the
            # billing dashboard; the canonical token count
            # (if/when exposed) can be plumbed in here
            # without changing the recorder contract.
            if self._billable is not None:
                estimated_tokens = sum(
                    max(1, len(t) // 4) for t in texts
                )
                self._billable.record_embedding(
                    tenant_id=tenant_id,
                    model=model_name,
                    input_tokens=estimated_tokens,
                    vectors_produced=len(vectors),
                    provider="openai",
                    resource_id=str(document_id),
                )

        return total_embedded
