/**
 * DocumentSelectionProvider — the documents
 * "currently selected row" state.
 *
 * **F3 Part 2 (Task 20).** Keeps the selected
 * document id in a tiny piece of context so the
 * toolbar / table / future slide-over can all
 * read + write it without prop-drilling.
 *
 * **Single-page consumers only.** The provider
 * lives at the documents page. A future cross-page
 * selection (e.g. "open this doc on the agents
 * page") would promote this to the (app) layout
 * level + persist the id in the URL.
 *
 * **Detail panel.** Part 3 introduces the actual
 * slide-over. For now the provider just tracks
 * the id; opening/closing is a no-op stub.
 *
 * **API.**
 *   - `selectedId` — the current row's id, or `null`.
 *   - `select(id)` — set the selection.
 *   - `clear()` — deselect.
 *   - `isOpen` — whether the detail panel is open
 *     (always `false` in Part 2; Part 3 wires the
 *     open/close).
 *   - `openDetail(id)` — convenience: select + open.
 *   - `closeDetail()` — clear + close.
 */

"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"

interface DocumentSelectionContextValue {
  selectedId: string | null
  isOpen: boolean
  select: (id: string) => void
  clear: () => void
  openDetail: (id: string) => void
  closeDetail: () => void
}

const DocumentSelectionContext = createContext<
  DocumentSelectionContextValue | undefined
>(undefined)

export function DocumentSelectionProvider({
  children,
}: {
  children: ReactNode
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // `isOpen` is wired in Part 3 when the slide-over
  // lands. For now it's always `false` so the page
  // doesn't try to render a missing detail panel.
  const [isOpen, setIsOpen] = useState(false)

  const select = useCallback((id: string) => {
    setSelectedId(id)
  }, [])
  const clear = useCallback(() => {
    setSelectedId(null)
    setIsOpen(false)
  }, [])
  const openDetail = useCallback((id: string) => {
    setSelectedId(id)
    // Part 3 wires the actual slide-over open here.
  }, [])
  const closeDetail = useCallback(() => {
    setSelectedId(null)
    setIsOpen(false)
  }, [])

  const value = useMemo<DocumentSelectionContextValue>(
    () => ({ selectedId, isOpen, select, clear, openDetail, closeDetail }),
    [selectedId, isOpen, select, clear, openDetail, closeDetail],
  )

  return (
    <DocumentSelectionContext.Provider value={value}>
      {children}
    </DocumentSelectionContext.Provider>
  )
}

export function useDocumentSelection(): DocumentSelectionContextValue {
  const ctx = useContext(DocumentSelectionContext)
  if (!ctx) {
    throw new Error(
      "useDocumentSelection must be used inside <DocumentSelectionProvider>",
    )
  }
  return ctx
}
