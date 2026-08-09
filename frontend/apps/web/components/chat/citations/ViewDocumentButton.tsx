/**
 * ViewDocumentButton — the "View full
 * document" CTA in the citation panel.
 *
 * **F4 Part 3 (Task 51).** Hides the
 * citation panel + opens the F3 document
 * drawer (Task 52). The drawer reads
 * `documentId` from the global
 * `documentSelectionStore` and fetches the
 * full document via `useDocument(id)`.
 *
 * **Why we close the panel on navigate.**
 * The citation panel is supporting
 * context for the conversation. When the
 * user explicitly asks to see the source
 * document, the conversation is no longer
 * the primary surface; the drawer is. The
 * spec is explicit (Task 74: the
 * conversation must remain exactly where
 * it was). Closing the panel is a UX cue
 * ("you've moved on") that does NOT
 * navigate away from the conversation.
 *
 * **No chunkId passing today.** The
 * spec's "highlight the source chunk"
 * path (Task 53) depends on a backend
 * contract we don't have yet (the F3
 * document detail doesn't yet understand
 * chunk-level navigation). The button
 * carries the chunk id as a forward-looking
 * data attribute so a future iteration of
 * the document detail can deep-link
 * without touching this component.
 */

"use client"

import { type MouseEvent, type ReactNode } from "react"

import { Button } from "@cortex/ui"

import {
  citationPanelStore,
} from "@/hooks/chat/citationPanelStore"
import {
  documentSelectionStore,
} from "@/components/documents/DocumentSelectionStore"

export interface ViewDocumentButtonProps {
  documentId: string
  /**
   * Forwarded as a `data-chunk-id` attribute
   * for future deep-linking from the document
   * drawer to a specific chunk. The current
   * drawer ignores it; a future V may pick
   * it up to scroll to + highlight the
   * matching excerpt.
   */
  chunkId?: string
  className?: string
}

export function ViewDocumentButton({
  documentId,
  chunkId,
  className,
}: ViewDocumentButtonProps): ReactNode {
  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault()
    // Close the citation panel first; the
    // document drawer slides in on the
    // right edge and the conversation
    // reclaims the full viewport.
    citationPanelStore.close()
    documentSelectionStore.openDetail(documentId)
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      data-document-id={documentId}
      data-chunk-id={chunkId}
      aria-label="View full document"
      className={className}
    >
      View full document
      <span aria-hidden="true" className="ml-1.5">→</span>
    </Button>
  )
}
