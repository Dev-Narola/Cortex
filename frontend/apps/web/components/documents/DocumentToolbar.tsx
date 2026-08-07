/**
 * DocumentToolbar — the row above the table.
 *
 * **F3 Part 2 (Task 15) + Part 4 (Task 42).**
 * Search box + filter + sort + Upload button.
 * The F1 `TableToolbar` primitive provides the
 * title/description/actions layout; we compose
 * the action surface.
 *
 * **State.** The search box is local UI state
 * (the spec says "search and filter locally —
 * UI only where backend support is absent"). The
 * filter + sort dropdowns are placeholders.
 *
 * **Connection indicator.** The description
 * slot is shared with the live ingestion
 * indicator: the page passes both `total` and
 * `connectionSlot` so the user sees "3 documents
 * • Live" (or "• Reconnecting…") in a single row.
 *
 * **Upload.** The Upload button opens the
 * `DocumentUploadModal`.
 */

"use client"

import { useState, type ReactNode } from "react"

import {
  Button,
  Icon,
  Input,
  TableToolbar,
  TooltipRoot,
} from "@cortex/ui"

export interface DocumentToolbarProps {
  /** Total count for the description line ("N documents"). */
  total: number
  /** True while the initial load is in flight. */
  loading: boolean
  /** Upload button click — opens the modal. */
  onUpload: () => void
  /**
   * Filter dropdown change. The F3 backend doesn't
   * support server-side filtering yet, so this is a
   * no-op stub. The hook layer will eventually
   * thread the filter into the query.
   */
  onFilterChange?: (filter: string | null) => void
  /**
   * Optional slot for the ingestion connection
   * indicator. Rendered inline with the count
   * description (e.g. "3 documents · Live").
   */
  connectionSlot?: ReactNode
}

export function DocumentToolbar({
  total,
  loading,
  onUpload,
  onFilterChange,
  connectionSlot,
}: DocumentToolbarProps): ReactNode {
  // Local search input — not yet wired to the data
  // layer (the spec marks this as a future task).
  const [search, setSearch] = useState("")

  return (
    <TableToolbar
      title="All documents"
      description={
        <span className="flex items-center gap-2">
          <span>
            {loading
              ? "Loading…"
              : `${total} ${total === 1 ? "document" : "documents"}`}
          </span>
          {connectionSlot}
        </span>
      }
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {/* Search box — local state, no filtering yet. */}
          <div className="relative">
            <Icon
              name="Search"
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              placeholder="Search documents…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search documents"
              className="h-8 w-48 pl-8 text-sm"
            />
          </div>

          {/* Filter dropdown — placeholder, surfaces
              the spec's "no backend support yet" story. */}
          <TooltipRoot content="Filters land once the backend supports them" side="bottom">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onFilterChange?.(null)}
              aria-label="Filter documents (coming soon)"
            >
              <Icon name="Filter" className="h-3.5 w-3.5" />
              <span>Filter</span>
            </Button>
          </TooltipRoot>

          {/* Sort dropdown — placeholder. */}
          <TooltipRoot content="Sorting lands once the backend supports it" side="bottom">
            <Button
              variant="outline"
              size="sm"
              aria-label="Sort documents (coming soon)"
            >
              <Icon name="SlidersHorizontal" className="h-3.5 w-3.5" />
              <span>Sort</span>
            </Button>
          </TooltipRoot>

          {/* Upload — opens the modal. Live in Part 3. */}
          <Button size="sm" onClick={onUpload} aria-label="Upload documents">
            <Icon name="Upload" className="h-3.5 w-3.5" />
            <span>Upload</span>
          </Button>
        </div>
      }
    />
  )
}
