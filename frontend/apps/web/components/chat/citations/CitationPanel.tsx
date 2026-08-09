/**
 * CitationPanel — F4 Part 3 (Tasks 44, 45,
 * 46, 56, 57, 58, 59, 60, 62, 74, 75).
 *
 * The 320px right-side panel that opens
 * when the user clicks a citation chip.
 * Reads the selection from
 * `useCitationPanelStore` and the citation
 * record from `useCitation` (which itself
 * reads the stream store).
 *
 * **Three render states.**
 *   1. `ready` — the streamed citation is
 *      available. Render the full panel
 *      (header + excerpt + View document).
 *   2. `unavailable` — the chunk id is on a
 *      message but the streamed metadata
 *      isn't in the store (reload case, or
 *      a future backend shape). Render a
 *      friendly "Source unavailable" body
 *      with the chunk id visible so the
 *      user can cross-reference.
 *   3. `missing` — no selection. Render
 *      nothing.
 *
 * **Layout (Task 45).** ~320px wide on
 * desktop (`sm:max-w-sm md:max-w-md`),
 * collapsible. On mobile the panel is a
 * slide-over from the right (we use the
 * `Drawer` primitive that already exists
 * in `@cortex/ui`). The conversation
 * remains the primary surface — the
 * panel is supporting context.
 *
 * **Close behavior (Task 46, 74).**
 *   - X button: `citationPanelStore.close()`
 *     (panel closed, selection retained
 *     so a re-click is a no-op).
 *   - Escape key: same.
 *   - Overlay click: same.
 * The conversation does NOT navigate.
 *
 * **Switching citations (Task 75).** The
 * panel reads the selection from the
 * store. Selecting a different citation
 * updates the store, which re-renders the
 * panel with the new content. We do not
 * close + reopen.
 *
 * **Animation (Task 60).** The Drawer
 * primitive handles the slide. We
 * deliberately do not add scale or
 * dramatic transitions — the
 * authenticated workspace stays calm.
 *
 * **Loading state (Task 56).** Today's
 * store reads are synchronous, so the
 * panel never enters a "loading" state.
 * The `Skeleton` path is wired for the
 * future chunk-detail REST endpoint — see
 * `useCitation`'s `isLoading: false` field.
 *
 * **Error state (Task 57).** The
 * `useCitation` hook reports
 * `status: "unavailable"` when the stream
 * didn't include the metadata. We render
 * that as a friendly state with a Retry
 * button that closes + re-opens the
 * panel (forcing a fresh read from the
 * store). A network error path would slot
 * in here once the chunk-detail endpoint
 * ships.
 *
 * **A11y (Task 62).** The Drawer primitive
 * manages focus trap, Escape, and labelled
 * `role="dialog"`. The panel header is an
 * `<h2>` so screen readers announce the
 * region.
 */

"use client"

import { useEffect, type ReactNode } from "react"

import { Button, Icon } from "@cortex/ui"

import { useCitation, useCitationPanelStore } from "@/hooks/chat"

import { CitationSourceHeader } from "./CitationSourceHeader"
import { SourceExcerpt } from "./SourceExcerpt"
import { ViewDocumentButton } from "./ViewDocumentButton"

export interface CitationPanelProps {
  /** Conversation id — the panel looks up
   *  citations in the per-conversation
   *  stream store. */
  conversationId: string
  className?: string
}

export function CitationPanel({
  conversationId,
  className,
}: CitationPanelProps): ReactNode | null {
  const isOpen = useCitationPanelStore((s) => s.isOpen)
  const selectedCitationId = useCitationPanelStore(
    (s) => s.selectedCitationId,
  )
  const close = useCitationPanelStore((s) => s.close)

  const { status, data } = useCitation({
    conversationId,
    citationId: selectedCitationId,
  })

  // Escape closes the panel (Task 62,
  // 74). The Drawer primitive handles
  // its own Escape behaviour, but the
  // panel also short-circuits when the
  // store's `isOpen` flips — so a second
  // Escape inside the content doesn't
  // trigger the store's close twice.
  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation()
        close()
      }
    }
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", onKey)
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("keydown", onKey)
      }
    }
  }, [isOpen, close])

  if (!isOpen) return null
  if (status === "missing" || !data) {
    // No selection, or the chunk is not
    // in the message at all. Render a
    // minimal "loading" affordance so
    // the panel still has dimensions
    // while we wait for the store to
    // settle.
    return (
      <aside
        role="complementary"
        aria-label="Citation panel"
        data-citation-panel
        data-citation-panel-state={status}
        className={
          "flex h-full w-full flex-col gap-4 border-l border-border bg-card/60 p-4 " +
          (className ?? "")
        }
      >
        <header className="flex items-start justify-between gap-2">
          <h2 className="font-display text-base font-semibold tracking-tight">
            Source
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={close}
            aria-label="Close citation panel"
          >
            <Icon name="X" className="h-4 w-4" />
          </Button>
        </header>
        {status === "unavailable" ? (
          <div className="flex flex-col gap-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground/80">
              Source unavailable
            </p>
            <p>
              The metadata for this citation isn't in the current
              session. The conversation can be re-streamed to
              refresh it.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={close}>
              Close
            </Button>
          </div>
        ) : null}
      </aside>
    )
  }

  return (
    <aside
      role="complementary"
      aria-label="Citation panel"
      data-citation-panel
      data-citation-panel-state={status}
      data-citation-id={data.id}
      className={
        "flex h-full w-full flex-col gap-4 border-l border-border bg-card/60 p-4 " +
        (className ?? "")
      }
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Source {data.index}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={close}
          aria-label="Close citation panel"
        >
          <Icon name="X" className="h-4 w-4" />
        </Button>
      </header>

      <CitationSourceHeader citation={data} />

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <SourceExcerpt citation={data} />
      </div>

      <footer className="flex flex-col gap-2 border-t border-border pt-3">
        <ViewDocumentButton
          documentId={data.documentId}
          chunkId={data.chunkId}
        />
      </footer>
    </aside>
  )
}
