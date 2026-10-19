/**
 * Client-side narrowing for the documents table.
 *
 * The list API has no name search or sort (it returns newest first, filtered
 * by an exact status), so the table loads up to 200 documents and narrows
 * them here. "Processing" groups every in-flight stage.
 */

import { type DocumentStatus, isInFlight } from "./status"

export type DocumentStatusFilter = "all" | "indexed" | "processing" | "failed"
export type DocumentSort = "newest" | "oldest" | "name"

interface Filterable {
  title: string
  status: DocumentStatus
  created_at: string
}

export function matchesStatus(status: DocumentStatus, filter: DocumentStatusFilter): boolean {
  if (filter === "all") return true
  if (filter === "processing") return isInFlight(status)
  return status === filter
}

export function filterDocuments<T extends Filterable>(
  items: readonly T[],
  {
    query = "",
    status = "all",
    sort = "newest",
  }: {
    query?: string
    status?: DocumentStatusFilter
    sort?: DocumentSort
  },
): T[] {
  const q = query.trim().toLowerCase()
  const out = items.filter(
    (d) => matchesStatus(d.status, status) && (!q || d.title.toLowerCase().includes(q)),
  )
  if (sort === "name") return out.sort((a, b) => a.title.localeCompare(b.title))
  const dir = sort === "oldest" ? 1 : -1
  return out.sort((a, b) => dir * (Date.parse(a.created_at) - Date.parse(b.created_at)))
}
