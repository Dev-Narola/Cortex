/**
 * DocumentRow — a single row in the documents table.
 *
 * **F3 Part 2 (Task 16).** Composes the F1
 * `TableRow` + `TableCell` primitives. Clicking
 * the row triggers the `DocumentSelectionProvider`
 * `openDetail()` — Part 3 wires the actual slide-over.
 *
 * **Columns.**
 *   - Document icon (derived from `mime_type`)
 *   - Name (`title`)
 *   - Status badge
 *   - Source type (`mime_type` truncated)
 *   - Updated date (formatted)
 *   - Actions (the spec's "Actions" column; currently
 *     a placeholder "…" button that opens the detail
 *     placeholder in Part 3)
 *
 * **Selection state.** When `id === selectedId` we
 * render an "active" visual (left-edge accent + row
 * bg) so the user can see which row is selected.
 */

"use client"

import type { ReactNode } from "react"

import {
  cn,
  Icon,
  TableCell,
  TableRow,
  TooltipRoot,
} from "@cortex/ui"

import { type Document } from "@/services/documents"

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
        "cursor-pointer transition-colors",
        isSelected && "bg-ember-500/10",
      )}
    >
      <TableCell>
        <div className="flex items-center gap-3">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
            aria-hidden
          >
            <Icon name={meta.name} className="h-4 w-4" />
          </span>
          <span className="font-medium text-foreground" title={document.title}>
            {document.title}
          </span>
        </div>
      </TableCell>

      <TableCell>
        <DocumentStatusBadge status={document.status} />
      </TableCell>

      <TableCell>
        <span
          className="font-mono text-xs text-muted-foreground"
          title={document.mime_type}
        >
          {document.mime_type}
        </span>
      </TableCell>

      <TableCell>
        <span className="text-sm text-muted-foreground">—</span>
      </TableCell>

      <TableCell>
        <time
          dateTime={document.created_at}
          className="text-sm text-muted-foreground"
        >
          {formatDate(document.created_at)}
        </time>
      </TableCell>

      <TableCell>
        <TooltipRoot content="Open details (Part 3)" side="left">
          <button
            type="button"
            aria-label={`Open ${document.title} details`}
            onClick={(e) => {
              e.stopPropagation()
              onOpenDetail(document.id)
            }}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Icon name="MoveHorizontal" className="h-4 w-4" />
          </button>
        </TooltipRoot>
      </TableCell>
    </TableRow>
  )
}
