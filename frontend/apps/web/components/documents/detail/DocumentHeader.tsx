/**
 * DocumentHeader — the title row at the top of the
 * document detail drawer.
 *
 * **F3 Part 3 (Task 27).** Title + status badge +
 * (future) breadcrumbs. Today: title + the
 * `DocumentStatusBadge`. The future chunk / graph /
 * embeddings tabs (per the spec) can reuse the same
 * header layout.
 *
 * **Layout.** Title is the dominant line; status
 * sits below as a small pill. The header is wrapped
 * by the drawer's `DrawerHeader` so the title
 * inherits the drawer's title styling.
 */

import type { ReactNode } from "react"

import { Heading } from "@cortex/ui"

import type { Document } from "@/services/documents"

import { DocumentStatusBadge } from "../DocumentStatusBadge"

export interface DocumentHeaderProps {
  document: Document
}

export function DocumentHeader({ document }: DocumentHeaderProps): ReactNode {
  return (
    <div className="space-y-2">
      <Heading level="h3" size="md" className="break-words">
        {document.title}
      </Heading>
      <div className="flex items-center gap-2">
        <DocumentStatusBadge status={document.status} />
        <span className="font-mono text-xs text-muted-foreground">
          {document.mime_type}
        </span>
      </div>
    </div>
  )
}
