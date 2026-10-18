"""V5 knowledge bounded context.

The knowledge context is the canonical home for documents, chunks,
embeddings metadata, and the V5 vector store abstraction. It is the
"what does Cortex know" half of the intelligence engine.

The V5 layer re-uses the V3 *ingestion* table (``documents`` /
``document_chunks``) for the upload-byte-pipeline path; the V5
``knowledge_documents`` / ``knowledge_chunks`` tables are the
*post-processing* records (text + token_count + embedding_id)
that the V3 ingestion worker writes once parsing / chunking /
embedding succeed. V3 stays the byte-pipeline; V5 owns the
"knowledge" view of the world.

Layer map (hexagonal):

* ``domain/``       — pure-Python entities, value objects, exceptions
* ``application/``  — use-case services (upload, process, retrieve)
* ``infrastructure/`` — SQLAlchemy models, repositories, extractors,
                       chunker, vector store abstraction
* ``interface/``    — REST routes (mounted by ``src/api.py``)
"""
