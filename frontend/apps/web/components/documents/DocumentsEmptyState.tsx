/**
 * DocumentsEmptyState — the documents table's
 * "no documents yet" surface.
 *
 * **F3 Part 2 (Task 18).** Renders the F1
 * `EmptyState` primitive with the spec's exact copy
 * + the spec's primary "Upload Document" CTA.
 *
 * **The CTA is a placeholder in Part 2.** Spec says
 * "Upload opens in Part 3." We render a real button
 * that fires `onUpload` so the toolbar's Upload
 * button + this CTA share the same open-modal path;
 * the actual upload logic lands in Part 3.
 *
 * **No data.** This surface shows only when the
 * backend returned `items.length === 0`. Error and
 * loading states live in their own components.
 */

"use client"

import type { ReactNode } from "react"

import { EmptyState, Icon } from "@cortex/ui"

export interface DocumentsEmptyStateProps {
  /** Upload button click — opens the modal. */
  onUpload: () => void
}

export function DocumentsEmptyState({
  onUpload,
}: DocumentsEmptyStateProps): ReactNode {
  return (
    <EmptyState
      icon="FileText"
      title="No documents yet"
      description="Upload your first document to begin building your knowledge base."
      actionLabel="Upload Document"
      onAction={onUpload}
    >
      {/* The F1 EmptyState doesn't accept a trailing
          hint node; we render one below the surface to
          communicate the future-folder story. */}
      <p className="mt-1 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Icon name="Sparkles" className="h-3 w-3" />
        <span>Files you upload will appear here once they're indexed.</span>
      </p>
    </EmptyState>
  )
}
