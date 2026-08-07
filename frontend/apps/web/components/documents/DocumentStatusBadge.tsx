/**
 * DocumentStatusBadge — semantic variant for the
 * backend's `DocumentStatus` enum.
 *
 * **F3 Part 2 (Task 17).** Maps every status in
 * the enum to a colour-coded `Badge` variant. Never
 * hardcodes colours — the F1 `Badge` component
 * owns the colour tokens.
 *
 * **Status → variant.**
 *   - `pending`   → `pending`  (grey)  — queued
 *   - `parsing`   → `processing` (blue) — extracting text
 *   - `chunking`  → `processing` (blue) — splitting into pieces
 *   - `embedding` → `processing` (blue) — generating vectors
 *   - `indexed`   → `completed`  (green) — ready for search
 *   - `failed`    → `failed`     (red)  — needs attention
 *
 * The future WebSocket (Part 4) will call the same
 * `useDocuments()` cache to push live status flips
 * without changing the visual mapping here.
 */

import { Badge, type BadgeProps } from "@cortex/ui"

import type { DocumentStatus } from "@/services/documents"

const VARIANT: Record<DocumentStatus, BadgeProps["variant"]> = {
  pending: "pending",
  parsing: "processing",
  chunking: "processing",
  embedding: "processing",
  indexed: "completed",
  failed: "failed",
}

/** Human-readable label for a status. */
const LABEL: Record<DocumentStatus, string> = {
  pending: "Pending",
  parsing: "Parsing",
  chunking: "Chunking",
  embedding: "Embedding",
  indexed: "Indexed",
  failed: "Failed",
}

export interface DocumentStatusBadgeProps {
  status: DocumentStatus
  className?: string
}

export function DocumentStatusBadge({
  status,
  className,
}: DocumentStatusBadgeProps) {
  return (
    <Badge variant={VARIANT[status]} className={className}>
      {LABEL[status]}
    </Badge>
  )
}
