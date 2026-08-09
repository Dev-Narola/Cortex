/**
 * Citation panel store — F4 Part 3 (Task 43).
 *
 * Local UI state for the citation panel:
 *   - which citation is currently shown
 *   - whether the panel is open
 *
 * **Why this lives in a Zustand store, not the
 * component tree.** The `CitationPanel`, the
 * `CitationChip` (in the assistant message),
 * and the `ChatLayout` all need to coordinate
 * the open/close + selection transitions
 * without prop-drilling through the layout.
 * A small store keeps that coordination
 * explicit and testable.
 *
 * **What this store does NOT hold.** Citation
 * *data* (the actual `Citation` records) is
 * NOT stored here. The stream store is the
 * single source of truth for citation data;
 * the panel reads from the stream store on
 * demand via `useCitation` (Task 66). This
 * store only tracks the user's *selection*
 * state — server data is TanStack Query,
 * local UI is Zustand, per the architecture
 * rule.
 *
 * **Single panel, single selection.** Only one
 * citation is visible at a time. Selecting a
 * different citation updates the selection
 * without closing + reopening the panel.
 *
 * **Open by default on desktop, overlay on
 * mobile.** The store does not own viewport
 * state — the layout decides the panel's
 * rendering mode based on the viewport. The
 * store only owns "is the user looking at
 * citations right now".
 */

import { create } from "zustand"

import type { Citation } from "@/types/citation"

interface CitationPanelState {
  /** Citation currently shown in the panel. */
  selectedCitationId: string | null
  /** True while the user is interacting with
   *  the citation panel. The layout uses
   *  this to decide between inline (desktop)
   *  and overlay (mobile) presentation. */
  isOpen: boolean

  /** Open the panel and select a citation. */
  open: (citationId: string) => void
  /** Update the selected citation without
   *  closing + reopening. */
  select: (citationId: string) => void
  /** Close the panel. The selection is
   *  retained so the next `open` is a no-op
   *  if the same citation is re-selected. */
  close: () => void
  /** Reset the selection. Use when the
   *  conversation changes (e.g. navigating
   *  to a different /chat/{id}). */
  reset: () => void
}

export const useCitationPanelStore = create<CitationPanelState>((set) => ({
  selectedCitationId: null,
  isOpen: false,

  open: (citationId) => {
    set({ selectedCitationId: citationId, isOpen: true })
  },
  select: (citationId) => {
    set({ selectedCitationId: citationId, isOpen: true })
  },
  close: () => {
    set({ isOpen: false })
  },
  reset: () => {
    set({ selectedCitationId: null, isOpen: false })
  },
}))

/**
 * The imperative handle the rest of the
 * app uses (e.g. `viewDocumentButton` calls
 * `panelStore.close()` after navigating to
 * the F3 document drawer, because the
 * citation panel hands off to the existing
 * document experience — Task 52).
 */
export const citationPanelStore = {
  open: (citationId: string) =>
    useCitationPanelStore.getState().open(citationId),
  select: (citationId: string) =>
    useCitationPanelStore.getState().select(citationId),
  close: () => useCitationPanelStore.getState().close(),
  reset: () => useCitationPanelStore.getState().reset(),
}

/**
 * Pure helper: pull a `Citation` by id out
 * of a list. Used by the panel's data
 * accessor to map a selection to the
 * underlying record.
 */
export function findCitation(
  citations: ReadonlyArray<Citation>,
  id: string | null,
): Citation | null {
  if (!id) return null
  return citations.find((c) => c.id === id) ?? null
}
