# 12. Chunking Strategy

Date: 2026-07-22

## Status

Accepted

## Context

Search and retrieval quality is directly tied to how documents are split into chunks before indexing. A chunk that is too large reduces precision — the retrieved passage contains too much irrelevant content. A chunk that is too small loses context — the retrieved passage makes no sense in isolation.

Three different document structures require different splitting approaches:

- **Prose documents** (reports, articles, emails): natural paragraph and sentence boundaries matter. Splitting in the middle of a sentence degrades embedding quality.
- **Long unstructured text** (logs, raw dumps): no clear semantic boundaries; fixed-size windows with overlap are sufficient and predictable.
- **Structured documents** (Markdown, technical documentation): headings define semantic sections. Splitting at heading boundaries preserves the document's inherent information hierarchy.

A single chunking strategy cannot serve all three cases optimally.

## Decision

We implement three chunking strategies and select between them at ingestion time.

### 1. `FixedSizeChunker`

Splits text into windows of exactly `chunk_size` tokens (default: 1000) with an `overlap` of tokens carried over from the previous chunk (default: 150).

```
[0 ─────────── 1000]
         [850 ─────────── 1850]
                   [1700 ─────────── 2700]
```

**When to use:** Long unstructured text, binary-converted content, or documents where sentence boundaries cannot be reliably detected.

### 2. `SentenceChunker`

Groups complete sentences into chunks that stay within a `max_chunk_size` token budget. Sentences are never split mid-sentence. An optional `overlap_sentences` parameter repeats the last N sentences of the previous chunk at the start of the next.

**When to use:** Prose documents (articles, reports, emails) where sentence integrity is important for embedding quality.

### 3. `MarkdownChunker`

Splits on Markdown heading boundaries (`#`, `##`, `###`, etc.). Each section becomes one chunk. Sections that exceed `max_chunk_size` are further subdivided using `SentenceChunker`.

**When to use:** Markdown documents, technical documentation, README files, and any structured text where headings define logical sections.

### Strategy selection

The strategy is chosen in `ingest_document_task` based on the document's `mime_type`:

| MIME type | Strategy |
|---|---|
| `text/markdown` | `MarkdownChunker` |
| `text/plain` | `SentenceChunker` |
| `application/pdf` | `SentenceChunker` (post-parse) |
| `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | `SentenceChunker` (post-parse) |
| _fallback_ | `FixedSizeChunker` |

Strategy parameters are configurable via application settings and do not require code changes to tune.

## Consequences

- All three strategies must implement the `ChunkingStrategy` abstract base class defined in `src/ingestion/application/chunking.py`. Adding a new strategy requires implementing the interface, registering it in the selection logic, and adding unit tests.
- Chunk size defaults (1000 tokens, 150 overlap) are V2 heuristics. They should be revisited once retrieval quality metrics are available.
- The `chunk_index` field on each chunk is the zero-based position within the document. It must be unique per document and must preserve document order. Tests enforce both invariants.
- Changing chunk parameters for an existing document requires a reprocess operation (see ADR-0010), which replaces all chunks.
