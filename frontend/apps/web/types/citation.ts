/**
 * Citation domain types — F4 Part 3.
 *
 * **Backend contract (audited from the V3 source).**
 *
 * The backend's `CitationSchema` carries:
 *
 *   - `document_id`, `chunk_id`     — chunk / document pointers
 *   - `document_title`             — for the side-panel header
 *   - `chunk_index`                — for "Chunk N of M" copy
 *   - `score`                      — relevance score (default 0)
 *   - `excerpt`                    — short chunk text for the
 *                                    citation panel
 *
 * Citations are streamed in `citation` envelopes over
 * `/ws/conversations/{id}` (F4 P2 contract). They arrive
 * in numerical order ([1], [2], …) so the client can
 * render inline markers that point at the right source.
 *
 * **What the API REST endpoint returns.** The
 * `GET /conversations/{id}` response includes
 * `retrieved_chunk_ids: uuid[]` on each assistant
 * message — but NOT the full citation metadata
 * (no title, no excerpt, no chunk_index). So on
 * reload of a completed conversation, the
 * frontend has only the chunk IDs and the
 * streamed citation data is gone. Part 3 makes
 * the live (in-flight) case work perfectly; the
 * reload case renders the chunk IDs as
 * "[1] [2] [3]" with the title/excerpt only
 * available when the user re-streams the answer
 * (or when we add a dedicated `GET /chunks/{id}`
 * endpoint in a future phase).
 *
 * **Why we have two parallel types.** The
 * `ConversationCitation` in `types/websocket.ts`
 * is the wire-shape (snake_case → camelCase
 * mapping already done in the parser). The
 * `Citation` here is the UI-shape — the same
 * data, but with a `id` derived from the chunk
 * for stable React keys + a typed `metadata`
 * surface for the citation panel.
 *
 * **Trust model.** Every citation chip renders
 * with the assumption that
 * `citation.chunkId` is real. The component
 * never invents a citation; the resolver never
 * synthesizes a missing one. If the backend
 * stream doesn't include citation metadata for
 * a particular chunk ID, the chip's number
 * still appears in numerical order, but the
 * panel will surface a friendly "Source
 * unavailable" state.
 */

import type { Message } from "./conversation"

export interface Citation {
  /**
   * Stable UI identifier. We derive it from
   * the chunk id (every chunk yields exactly
   * one citation in the resolver), so React
   * keys + the panel's "selected" state both
   * have a stable handle.
   */
  id: string
  /**
   * 1-based ordinal assigned by the resolver.
   * Drives the chip label (`[1]`, `[2]`,
   * …) and is the same index the backend
   * emits citations in. Stable for the
   * lifetime of the resolver output.
   */
  index: number
  /**
   * Document UUID. Used to deep-link into the
   * existing F3 `DocumentDetailDrawer` when
   * the user clicks "View full document".
   */
  documentId: string
  /**
   * Chunk UUID. The actual grounding unit —
   * the smallest piece of evidence that
   * supports the answer.
   */
  chunkId: string
  /**
   * Document title for the panel header
   * ("Architecture document.md").
   */
  documentTitle: string
  /**
   * Zero-based index of this chunk within
   * its document. Used in the panel's
   * "Chunk N of M" copy.
   */
  chunkIndex: number
  /**
   * Relevance score from the search service.
   * Zero when no reranker ran. We surface it
   * sparingly — the panel shows it as a small
   * badge, not a large bar.
   */
  score: number
  /**
   * Short excerpt of the cited chunk. This
   * is the actual `document_chunks.content`
   * (or a fragment thereof) that the assistant
   * was grounded against. Required at the
   * domain level; the stream sometimes
   * arrives without one and we surface that
   * via the "Source unavailable" state.
   */
  excerpt: string | null
}

/**
 * Build a stable UI id from the chunk id.
 * The chunk id is globally unique, so the
 * derived id is too. The resolver uses this
 * for every citation it produces so React
 * keys are stable across re-renders.
 */
export function makeCitationId(chunkId: string): string {
  return `citation:${chunkId}`
}

/**
 * Build a `Citation` from a streamed
 * `ConversationCitation` + an ordinal.
 * The ordinal is the 1-based index the
 * resolver will surface in the UI ([1], [2],
 * …) — it's purely a UI concept and lives
 * here, not in the wire shape.
 */
export function makeCitationFromStream(
  wire: {
    documentId: string
    chunkId: string
    documentTitle: string
    chunkIndex: number
    score: number
    excerpt?: string
  },
  index: number,
): Citation {
  return {
    id: makeCitationId(wire.chunkId),
    index,
    documentId: wire.documentId,
    chunkId: wire.chunkId,
    documentTitle: wire.documentTitle,
    chunkIndex: wire.chunkIndex,
    score: wire.score,
    excerpt: wire.excerpt ?? null,
  }
}

/**
 * Local UI state for the citation panel.
 * Server data lives in TanStack Query
 * caches; this is the user's selection.
 */
export interface CitationSelection {
  /** Citation currently shown in the panel. */
  selectedCitationId: string | null
  /** Panel open/closed. */
  isOpen: boolean
}

/**
 * Citation summary — the bare-minimum info
 * the chip needs to render and announce to
 * screen readers. The full `Citation` is
 * loaded lazily by the panel.
 */
export interface CitationChipModel {
  id: string
  /** 1-based index. The chip renders as `[1]`. */
  index: number
  documentId: string
  chunkId: string
}

/**
 * `MessageWithCitations` — a message with its
 * resolved citations attached. We use this
 * shape at the UI boundary so the citation
 * resolver runs once at the data-loading
 * layer (and on stream completion) rather
 * than on every render.
 */
export interface MessageWithCitations extends Message {
  citations: Citation[]
}

export function emptyCitationSelection(): CitationSelection {
  return { selectedCitationId: null, isOpen: false }
}
