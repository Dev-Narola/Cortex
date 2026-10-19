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

import { useEffect, useMemo, useState } from "react"

import { Button, Card, PageHeader, Spinner } from "@cortex/ui"

import { ConnectionIndicator } from "@/components/documents/ConnectionIndicator"
import { DocumentErrorState } from "@/components/documents/DocumentErrorState"
import { DocumentSelectionProvider } from "@/components/documents/DocumentSelectionProvider"
import { DocumentToolbar } from "@/components/documents/DocumentToolbar"
import { DocumentsEmptyState } from "@/components/documents/DocumentsEmptyState"
import { DocumentsTable } from "@/components/documents/DocumentsTable"
import { DocumentDetailDrawer } from "@/components/documents/detail/DocumentDetailDrawer"
import { UploadDocumentModal } from "@/components/documents/upload/UploadDocumentModal"
import { useDocuments, useIngestionStatus } from "@/hooks/documents"
import {
  type DocumentSort,
  type DocumentStatusFilter,
  filterDocuments,
  matchesStatus,
} from "@/lib/documents/filter"

/** The API's page-size ceiling; search, filter and sort apply to these rows. */
const PAGE = 200

export function DocumentsView() {
  const { data, isLoading, isError, error, refetch, isFetching } = useDocuments({ limit: PAGE })
  const { connectionState } = useIngestionStatus()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<DocumentStatusFilter>("all")
  const [sort, setSort] = useState<DocumentSort>("newest")
  // `/app/documents?upload=1` (dashboard CTA) opens the upload dialog.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("upload") === "1") setUploadOpen(true)
  }, [])

  const items = data?.items ?? []
  const visible = useMemo(
    () => filterDocuments(items, { query, status, sort }),
    [items, query, status, sort],
  )
  const statusCounts = useMemo(
    () =>
      Object.fromEntries(
        (["all", "indexed", "processing", "failed"] as const).map((f) => [
          f,
          items.filter((d) => matchesStatus(d.status, f)).length,
        ]),
      ),
    [items],
  )
  const narrowed = query.trim() !== "" || status !== "all"

  return (
    <DocumentSelectionProvider>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <PageHeader
          title="Documents"
          description="Everything Cortex can answer from. Upload a file or import a page; each one is parsed, chunked and embedded, and you can watch it happen live."
        />

        <Card radius="xl" padding="none" className="overflow-hidden">
          {isError ? null : (
            <DocumentToolbar
              total={data?.total ?? 0}
              loading={isLoading}
              onUpload={() => setUploadOpen(true)}
              query={query}
              onQueryChange={setQuery}
              status={status}
              onStatusChange={setStatus}
              statusCounts={data ? statusCounts : undefined}
              sort={sort}
              onSortChange={setSort}
              connectionSlot={<ConnectionIndicator state={connectionState} />}
            />
          )}

          {isError ? (
            <div className="p-4">
              <DocumentErrorState error={error} onRetry={() => void refetch()} />
            </div>
          ) : isLoading ? (
            <output
              className="flex min-h-[280px] items-center justify-center p-8"
              aria-live="polite"
            >
              <Spinner size="lg" />
            </output>
          ) : data && data.items.length === 0 ? (
            <div className="p-4">
              <DocumentsEmptyState onUpload={() => setUploadOpen(true)} />
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <p className="text-sm text-muted-foreground">No documents match these filters.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setQuery("")
                  setStatus("all")
                }}
              >
                Clear filters
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <DocumentsTable documents={visible} />
            </div>
          )}

          {data && data.total > data.items.length ? (
            <p className="border-t border-divider px-5 py-3 text-xs text-muted-foreground">
              Showing the {data.items.length} most recent of {data.total} documents
              {narrowed ? "; search and filters apply to these." : "."}
            </p>
          ) : null}
        </Card>

        {isFetching && !isLoading ? (
          <p className="text-right text-xs text-muted-foreground" aria-live="polite">
            Refreshing…
          </p>
        ) : null}

        <UploadDocumentModal open={uploadOpen} onOpenChange={setUploadOpen} />
        <DocumentDetailDrawer />
      </div>
    </DocumentSelectionProvider>
  )
}
