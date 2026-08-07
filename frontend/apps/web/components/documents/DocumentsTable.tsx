/**
 * DocumentsTable — the documents data table.
 *
 * **F3 Part 2 (Task 14).** Composes the F1
 * `Table` / `TableHeader` / `TableBody` / `TableRow`
 * / `TableCell` primitives. Rows come directly
 * from the backend (no client-side derivation).
 *
 * **Selection.** Reads + writes through
 * `useDocumentSelection()`. The row's "active"
 * visual is driven by `selectedId === row.id`.
 *
 * **Future.** When the WebSocket lands (Part 4)
 * the data flows through `useDocuments()` which
 * already invalidates on refetch — no change
 * needed here.
 */

"use client"

import type { ReactNode } from "react"

import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow as UiTableRow,
} from "@cortex/ui"

import type { Document } from "@/services/documents"

import { DocumentRow } from "./DocumentRow"
import { useDocumentSelection } from "./DocumentSelectionProvider"

export interface DocumentsTableProps {
  documents: Document[]
}

export function DocumentsTable({ documents }: DocumentsTableProps): ReactNode {
  const { selectedId, select, openDetail } = useDocumentSelection()

  return (
    <Table>
      <TableHeader>
        <UiTableRow>
          <TableHead>Name</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Chunks</TableHead>
          <TableHead>Updated</TableHead>
          <TableHead className="w-12">
            <span className="sr-only">Actions</span>
          </TableHead>
        </UiTableRow>
      </TableHeader>
      <TableBody>
        {documents.map((doc) => (
          <DocumentRow
            key={doc.id}
            document={doc}
            isSelected={doc.id === selectedId}
            onSelect={select}
            onOpenDetail={openDetail}
          />
        ))}
      </TableBody>
    </Table>
  )
}
