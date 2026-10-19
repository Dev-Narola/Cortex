/**
 * DocumentRow — a single row in the documents table.
 *
 * **F3 Part 2 (Task 16) + Part 4 (Task 38).**
 * Composes the F1 `TableRow` + `TableCell`
 * primitives. Clicking the row triggers the
 * `DocumentSelectionProvider` `openDetail()` —
 * Part 3 wires the actual slide-over.
 *
 * **Columns.**
 *   - Document icon (derived from `mime_type`)
 *   - Name (`title`)
 *   - Status badge + progress line
 *   - Source type (`mime_type` truncated)
 *   - Chunks (placeholder)
 *   - Updated date (formatted)
 *   - Actions
 *
 * **Live status.** The badge + the progress
 * line both read from `document.status`, which
 * the `useIngestionStatus` hook patches
 * directly in the TanStack Query cache. No
 * extra wiring in this component — when the
 * cache updates, React re-renders this row.
 *
 * **Selection state.** When `id === selectedId` we
 * render an "active" visual (left-edge accent + row
 * bg) so the user can see which row is selected.
 */

"use client"

import type { ReactNode } from "react"

import { Icon, TableCell, TableRow, cn } from "@cortex/ui"

import { isInFlight } from "@/lib/documents/status"

import type { Document } from "@/services/documents"

import { DocumentIngestionProgress } from "./DocumentIngestionProgress"
import { DocumentStatusBadge } from "./DocumentStatusBadge"

export interface DocumentRowProps {
  document: Document
  isSelected: boolean
  onSelect: (id: string) => void
  onOpenDetail: (id: string) => void
}

function mimeIcon(mime: string): { name: "FileText" | "Image" | "File"; fallback: string } {
  if (mime.startsWith("image/")) return { name: "Image", fallback: "IMG" }
  if (mime.startsWith("text/") || mime.includes("pdf")) {
    return { name: "FileText", fallback: "DOC" }
  }
  return { name: "File", fallback: "FILE" }
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function DocumentRow({
  document,
  isSelected,
  onSelect,
  onOpenDetail,
}: DocumentRowProps): ReactNode {
  const meta = mimeIcon(document.mime_type)

  return (
    <TableRow
      data-state={isSelected ? "selected" : "default"}
      aria-selected={isSelected || undefined}
      onClick={() => {
        onSelect(document.id)
        onOpenDetail(document.id)
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          onSelect(document.id)
          onOpenDetail(document.id)
        }
      }}
      tabIndex={0}
      className={cn(
        "group cursor-pointer transition-colors hover:bg-muted",
        isSelected && "bg-brand-soft hover:bg-brand-soft",
      )}
    >
      <TableCell>
        <div className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-tint text-muted-foreground"
            aria-hidden
          >
            <Icon name={meta.name} className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span
              className="block max-w-[14rem] truncate font-medium text-foreground sm:max-w-[22rem]"
              title={document.title}
            >
              {document.title}
            </span>
            <span className="block truncate font-mono text-[11px] text-faint @4xl:hidden">
              {document.mime_type}
            </span>
          </span>
        </div>
      </TableCell>

      <TableCell>
        {/* In flight: the live stage bar; otherwise the final state. */}
        {isInFlight(document.status) ? (
          <DocumentIngestionProgress status={document.status} className="w-40" />
        ) : (
          <DocumentStatusBadge status={document.status} />
        )}
      </TableCell>

      <TableCell className="hidden @4xl:table-cell">
        <span className="font-mono text-xs text-muted-foreground" title={document.mime_type}>
          {document.mime_type}
        </span>
      </TableCell>

      <TableCell className="hidden @2xl:table-cell">
        <time
          dateTime={document.created_at}
          className="whitespace-nowrap text-sm text-muted-foreground"
        >
          {formatDate(document.created_at)}
        </time>
      </TableCell>

      <TableCell>
        <button
          type="button"
          aria-label={`Open ${document.title} details`}
          onClick={(e) => {
            e.stopPropagation()
            onOpenDetail(document.id)
          }}
          className="rounded-full p-1.5 text-faint transition-[color,background-color,transform] duration-fast group-hover:translate-x-0.5 group-hover:text-foreground hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon name="ChevronRight" className="h-4 w-4" />
        </button>
      </TableCell>
    </TableRow>
  )
}
