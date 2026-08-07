/**
 * DocumentSelectionProvider — the documents
 * "currently selected row" state.
 *
 * **F3 Part 2 (Task 20) + Part 3.** Keeps the
 * selected document id in a tiny piece of context so
 * the table / future slide-over / delete / reprocess
 * buttons can all read + write it without prop-drilling.
 *
 * **Single-page consumers only.** The provider
 * lives at the documents page. A future cross-page
 * selection (e.g. "open this doc on the agents
 * page") would promote this to the (app) layout
 * level + persist the id in the URL.
 *
 * **Detail panel.** `isOpen` is now `true` whenever
 * the slide-over is mounted. The provider doesn't
 * own the DOM — that's `DocumentDetailDrawer`'s job
 * (it reads `selectedId` + `isOpen` and decides
 * whether to mount the Radix Dialog).
 *
 * **API.**
 *   - `selectedId` — the current row's id, or `null`.
 *   - `isOpen` — whether the detail panel is open.
 *   - `select(id)` — set the selection (table row hover).
 *   - `clear()` — deselect (closes the panel).
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
    setIsOpen(true)
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
