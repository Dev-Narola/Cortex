/**
 * DocumentToolbar — the row above the documents table.
 *
 * Title + count (with the live ingestion indicator), then the working
 * controls: name search, status filter pills, sort, Upload. The page owns the
 * state and narrows the loaded list with `filterDocuments` (the list API has
 * no search or sort), so every control here changes what the table shows.
 */

"use client"

import type { ReactNode } from "react"

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Icon,
  Input,
  TableToolbar,
  cn,
} from "@cortex/ui"

import type { DocumentSort, DocumentStatusFilter } from "@/lib/documents/filter"

const STATUS_OPTIONS: { value: DocumentStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "indexed", label: "Indexed" },
  { value: "processing", label: "Processing" },
  { value: "failed", label: "Failed" },
]

const SORT_LABEL: Record<DocumentSort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  name: "Name A–Z",
}

export interface DocumentToolbarProps {
  /** Total count for the description line ("N documents"). */
  total: number
  /** True while the initial load is in flight. */
  loading: boolean
  /** Upload button click — opens the modal. */
  onUpload: () => void
  query?: string
  onQueryChange?: (query: string) => void
  status?: DocumentStatusFilter
  onStatusChange?: (status: DocumentStatusFilter) => void
  /** Per-filter counts over the loaded documents, shown on the pills. */
  statusCounts?: Partial<Record<DocumentStatusFilter, number>>
  sort?: DocumentSort
  onSortChange?: (sort: DocumentSort) => void
  /** Live ingestion indicator, rendered next to the count. */
  connectionSlot?: ReactNode
}

export function DocumentToolbar({
  total,
  loading,
  onUpload,
  query = "",
  onQueryChange,
  status = "all",
  onStatusChange,
  statusCounts,
  sort = "newest",
  onSortChange,
  connectionSlot,
}: DocumentToolbarProps): ReactNode {
  return (
    <div className="border-y border-border">
      <TableToolbar
        className="border-b-0 px-4 pb-3 sm:px-6 lg:px-10"
        title="All documents"
        description={
          <span className="flex items-center gap-2">
            <span>
              {loading ? "Loading…" : `${total} ${total === 1 ? "document" : "documents"}`}
            </span>
            {connectionSlot}
          </span>
        }
        actions={
          <Button size="sm" onClick={onUpload} aria-label="Upload documents">
            <Icon name="Upload" className="h-3.5 w-3.5" />
            <span>Upload</span>
          </Button>
        }
      />
      <div className="flex flex-col gap-3 px-4 pb-4 sm:px-6 lg:flex-row lg:items-center lg:px-10">
        <div className="relative lg:w-64">
          <Icon
            name="Search"
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint"
          />
          <Input
            type="search"
            placeholder="Search by name…"
            value={query}
            onChange={(e) => onQueryChange?.(e.target.value)}
            aria-label="Search documents"
            className="h-9 rounded-full pl-8 text-sm"
          />
        </div>
        <fieldset className="flex min-w-0 flex-wrap items-center gap-1.5">
          <legend className="sr-only">Filter by status</legend>
          {STATUS_OPTIONS.map((o) => {
            const active = status === o.value
            const count = statusCounts?.[o.value]
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={active}
                onClick={() => onStatusChange?.(o.value)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors duration-fast",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card text-muted-foreground hover:border-border-strong hover:text-foreground",
                )}
              >
                {o.label}
                {count !== undefined ? (
                  <span className={cn("tabular", active ? "text-background/70" : "text-faint")}>
                    {count}
                  </span>
                ) : null}
              </button>
            )
          })}
        </fieldset>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="lg:ml-auto" aria-label="Sort documents">
              <Icon name="ArrowUpDown" className="h-3.5 w-3.5" />
              <span>{SORT_LABEL[sort]}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuRadioGroup
              value={sort}
              onValueChange={(v) => onSortChange?.(v as DocumentSort)}
            >
              {(Object.keys(SORT_LABEL) as DocumentSort[]).map((k) => (
                <DropdownMenuRadioItem key={k} value={k}>
                  {SORT_LABEL[k]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
