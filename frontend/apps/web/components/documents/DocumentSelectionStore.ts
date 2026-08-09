/**
 * Document selection — a tiny global store
 * for the document detail drawer.
 *
 * **Why a separate Zustand store, not the
 * existing React-context provider.** The
 * F3 `DocumentSelectionProvider` was a
 * local context, which meant only the
 * documents page could drive the drawer.
 * F4 Part 3 needs the citation panel (on
 * /chat/{id}) to open the same drawer when
 * the user clicks "View full document".
 *
 * Context is the wrong shape for that: a
 * context only reaches consumers under the
 * provider's tree, and mounting the
 * provider on /chat just to render the
 * drawer would add noise to the chat page.
 * A Zustand store, by contrast, is a
 * module-level singleton that any tree
 * can drive. The citation panel calls
 * `documentSelectionStore.openDetail(id)`
 * and the (app) layout's `<DocumentDetailHost>`
 * renders the drawer in response.
 *
 * **API.** Mirrors the F3 context API
 * exactly so the documents page can keep
 * using the existing `useDocumentSelection`
 * hook (which now reads this store via
 * `useDocumentSelectionStore`). Existing
 * call sites don't change.
 */

import { create } from "zustand"

interface DocumentSelectionState {
  selectedId: string | null
  isOpen: boolean
  select: (id: string) => void
  clear: () => void
  openDetail: (id: string) => void
  closeDetail: () => void
  /** Test-only: reset to the initial state. */
  reset: () => void
}

export const useDocumentSelectionStore = create<DocumentSelectionState>(
  (set) => ({
    selectedId: null,
    isOpen: false,
    select: (id) => {
      set({ selectedId: id })
    },
    clear: () => {
      set({ selectedId: null, isOpen: false })
    },
    openDetail: (id) => {
      set({ selectedId: id, isOpen: true })
    },
    closeDetail: () => {
      set({ selectedId: null, isOpen: false })
    },
    reset: () => {
      set({ selectedId: null, isOpen: false })
    },
  }),
)

/** Imperative handle for cross-tree access
 *  (e.g. the chat citation panel). */
export const documentSelectionStore = {
  openDetail: (id: string) =>
    useDocumentSelectionStore.getState().openDetail(id),
  closeDetail: () => useDocumentSelectionStore.getState().closeDetail(),
  clear: () => useDocumentSelectionStore.getState().clear(),
  select: (id: string) => useDocumentSelectionStore.getState().select(id),
}
