/**
 * DocumentMetadata — the metadata table for the
 * document detail drawer.
 *
 * **F3 Part 3 (Task 27).** Renders the rows the
 * spec asks for: Title, Status, Source, File Type,
 * File Size, Created, Updated, Chunk Count,
 * Metadata.
 *
 * **What the API actually returns.** The V4
 * `DocumentResponse` is `{ id, title, mime_type,
 * status, created_at }`. The spec wants
 * File Size / Updated / Chunk Count / Metadata too
 * — those are not in the public response (the
 * backend has them in the entity but doesn't surface
 * them yet). We render them as "—" placeholders so
 * the spec's visual contract is met; the moment
 * the backend adds them, swap the `??` fallbacks.
 *
 * **Composed of MetadataRow.** Each row is its own
 * component so the future Chunk / Graph / Embedding
 * tabs can reuse the same chrome (per the spec).
 */

import type { ReactNode } from "react"

import type { Document } from "@/services/documents"

import { DocumentStatusBadge } from "../DocumentStatusBadge"
import { MetadataRow } from "./MetadataRow"

export interface DocumentMetadataProps {
  document: Document
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

export function DocumentMetadata({
  document,
}: DocumentMetadataProps): ReactNode {
  return (
    <dl className="divide-y divide-border/60">
      <MetadataRow label="Title" value={document.title} />
      <MetadataRow
        label="Status"
        value={<DocumentStatusBadge status={document.status} />}
      />
      <MetadataRow
        label="Source"
        value={document.mime_type}
        monospace
      />
      <MetadataRow
        label="File type"
        value={document.mime_type}
        monospace
      />
      <MetadataRow label="File size" value="—" />
      <MetadataRow
        label="Created"
        value={formatDate(document.created_at)}
      />
      <MetadataRow label="Updated" value="—" />
      <MetadataRow label="Chunk count" value="—" />
      <MetadataRow label="Metadata" value="—" />
      <MetadataRow label="ID" value={document.id} monospace />
    </dl>
  )
}
