/**
 * DocumentsView — the client half of `/app/documents`.
 *
 * **F3 Part 2 (Task 11).** Composes the documents
 * module. Kept as a client component (not the page
 * itself) so the build doesn't try to pre-render
 * the TanStack Query / auth-store calls.
 *
 * **Flow.**
 *   1. Wrap in `DocumentSelectionProvider` so the
 *      future slide-over + the rows share the same
 *      `selectedId` context.
 *   2. `useDocuments()` — the single source of truth.
 *   3. Render toolbar (above) + the appropriate
 *      surface below:
 *        - error → `DocumentErrorState`
 *        - loading (no data) → centered `Spinner`
 *        - empty → `DocumentsEmptyState`
 *        - data → `DocumentsTable`
 *
 * **The toolbar shows even on the loading / error
 * / empty states** so the user can still click
 * "Upload" (which opens the modal). On the error
 * state we hide the toolbar to keep the retry
 * surface clean.
 *
 * **No business logic.** Every action delegates
 * to the reusable components.
 */

"use client"

import { useState } from "react"

import { Card, CardContent, Spinner } from "@cortex/ui"

import { DocumentErrorState } from "@/components/documents/DocumentErrorState"
import { DocumentSelectionProvider } from "@/components/documents/DocumentSelectionProvider"
import { DocumentToolbar } from "@/components/documents/DocumentToolbar"
import { DocumentUploadModal } from "@/components/documents/upload-modal"
import { DocumentsEmptyState } from "@/components/documents/DocumentsEmptyState"
import { DocumentsTable } from "@/components/documents/DocumentsTable"
import { useDocuments } from "@/hooks/documents"

export function DocumentsView() {
  const { data, isLoading, isError, error, refetch, isFetching } = useDocuments()
  const [uploadOpen, setUploadOpen] = useState(false)

  return (
    <DocumentSelectionProvider>
      <div className="space-y-6">
        {/* Page header — matches the (app) layout's
            main padding + the dashboard hero. The
            toolbar doubles as the "actions" row. */}
        <header className="space-y-1">
          <h1 className="font-display text-3xl font-semibold tracking-tight">Documents</h1>
          <p className="text-sm text-muted-foreground">
            Upload, search, and inspect every document in your tenant.
          </p>
        </header>

        <Card>
          {/* Toolbar sits inside the card so the table
              aligns with the chrome. Hidden on the error
              state to keep the retry surface uncluttered. */}
          {isError ? null : (
            <DocumentToolbar
              total={data?.total ?? 0}
              loading={isLoading}
              onUpload={() => setUploadOpen(true)}
            />
          )}

          <CardContent className="p-0">
            {isError ? (
              <div className="p-4">
                <DocumentErrorState error={error} onRetry={() => void refetch()} />
              </div>
            ) : isLoading ? (
              <div
                className="flex min-h-[280px] items-center justify-center p-8"
                role="status"
                aria-live="polite"
              >
                <Spinner size="lg" />
              </div>
            ) : data && data.items.length === 0 ? (
              <div className="p-4">
                <DocumentsEmptyState onUpload={() => setUploadOpen(true)} />
              </div>
            ) : data ? (
              <DocumentsTable documents={data.items} />
            ) : null}
          </CardContent>
        </Card>

        {/* Background refetch indicator — subtle. Lives
            in the corner of the page so the user knows
            something is happening. */}
        {isFetching && !isLoading ? (
          <p
            className="text-right text-xs text-muted-foreground"
            aria-live="polite"
          >
            Refreshing…
          </p>
        ) : null}

        <DocumentUploadModal open={uploadOpen} onOpenChange={setUploadOpen} />
      </div>
    </DocumentSelectionProvider>
  )
}
