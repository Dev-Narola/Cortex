/**
 * DocumentsView — the client half of `/app/documents`.
 *
 * **F3 Part 2 (Task 11) + Part 3 + Part 4.** Composes
 * the documents module. Kept as a client component
 * (not the page itself) so the build doesn't try
 * to pre-render the TanStack Query / auth-store
 * calls.
 *
 * **Flow.**
 *   1. `useIngestionStatus()` — mounts the shared
 *      WebSocket subscription (Task 36). The
 *      connection state is rendered as a small
 *      pill in the toolbar (Task 42).
 *   2. `useDocuments()` — the single source of truth
 *      for the list. WebSocket events patch the
 *      cache directly (Task 37).
 *   3. Render toolbar + the appropriate surface
 *      below (error / loading / empty / data).
 *   4. The `DocumentDetailDrawer` reads the
 *      selection context and mounts the slide-over
 *      whenever a row is clicked.
 *
 * **No business logic outside this file.** Every
 * action delegates to the reusable components.
 */

"use client"

import { useState } from "react"

import { Card, CardContent, Spinner } from "@cortex/ui"

import { ConnectionIndicator } from "@/components/documents/ConnectionIndicator"
import { DocumentDetailDrawer } from "@/components/documents/detail/DocumentDetailDrawer"
import { DocumentErrorState } from "@/components/documents/DocumentErrorState"
import { DocumentSelectionProvider } from "@/components/documents/DocumentSelectionProvider"
import { DocumentToolbar } from "@/components/documents/DocumentToolbar"
import { DocumentsEmptyState } from "@/components/documents/DocumentsEmptyState"
import { DocumentsTable } from "@/components/documents/DocumentsTable"
import { UploadDocumentModal } from "@/components/documents/upload/UploadDocumentModal"
import { useDocuments, useIngestionStatus } from "@/hooks/documents"

export function DocumentsView() {
  const { data, isLoading, isError, error, refetch, isFetching } = useDocuments()
  const { connectionState } = useIngestionStatus()
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
              state to keep the retry surface uncluttered.
              The connection indicator lives in the
              description slot so the user can see the
              live channel state at a glance. */}
          {isError ? null : (
            <DocumentToolbar
              total={data?.total ?? 0}
              loading={isLoading}
              onUpload={() => setUploadOpen(true)}
              connectionSlot={
                <ConnectionIndicator state={connectionState} />
              }
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

        <UploadDocumentModal open={uploadOpen} onOpenChange={setUploadOpen} />
        <DocumentDetailDrawer />
      </div>
    </DocumentSelectionProvider>
  )
}
