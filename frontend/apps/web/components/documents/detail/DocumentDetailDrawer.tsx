/**
 * DocumentDetailDrawer — the right-side slide-over
 * that opens when a document row is selected.
 *
 * **F3 Part 3 (Task 26).** Wires together:
 *   - The F1 `Drawer` primitive (right side, per spec).
 *   - `useDocument(id)` — TanStack Query for the
 *     selected document (`GET /documents/{id}`).
 *   - The header + metadata layout (Task 27).
 *   - The Delete + Reprocess dialogs (Tasks 28/29).
 *
 * **Open / close state.** Lives in
 * `DocumentSelectionProvider` — the drawer reads
 * `selectedId` + `isOpen` and decides whether to
 * mount. Closing the drawer calls `closeDetail()`,
 * which also clears the selection.
 *
 * **Loading + error states.** Renders an
 * `ErrorState` for 404s (the document was deleted
 * from under us) + 5xx, a `Spinner` while the
 * fetch is in flight, and the full layout when
 * the data arrives.
 *
 * **No editing.** The spec calls this out explicitly:
 * "No editing yet." The metadata table is read-only.
 */

"use client"

import { useState, type ReactNode } from "react"

import {
  Button,
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  ErrorState,
  Icon,
  Spinner,
  toast,
} from "@cortex/ui"

import { useDocument } from "@/hooks/documents"
import { toFrontendError } from "@/lib/http/errors"
import type { Document } from "@/services/documents"

import { useDocumentSelection } from "../DocumentSelectionProvider"
import { DeleteDocumentDialog } from "../actions/DeleteDocumentDialog"
import { ReprocessDocumentDialog } from "../actions/ReprocessDocumentDialog"
import { DocumentHeader } from "./DocumentHeader"
import { DocumentMetadata } from "./DocumentMetadata"

export function DocumentDetailDrawer(): ReactNode {
  const { selectedId, isOpen, closeDetail } = useDocumentSelection()
  const { data, isLoading, isError, error, refetch } = useDocument(selectedId)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [reprocessOpen, setReprocessOpen] = useState(false)

  // Re-derive the FrontendError for the ErrorState copy.
  const fe = isError ? toFrontendError(error) : null

  function onCopyId(doc: Document) {
    if (typeof navigator === "undefined" || !navigator.clipboard) return
    navigator.clipboard.writeText(doc.id).then(
      () =>
        toast({
          title: "Document ID copied",
          description: doc.id,
          variant: "success",
        }),
      () =>
        toast({
          title: "Couldn't copy",
          description: "Clipboard access denied.",
          variant: "destructive",
        }),
    )
  }

  return (
    <>
      <Drawer
        open={isOpen && Boolean(selectedId)}
        onOpenChange={(next) => {
          if (!next) closeDetail()
        }}
      >
        <DrawerContent
          side="right"
          widthClassName="sm:max-w-md"
          aria-describedby="document-detail-description"
        >
          <DrawerHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <DrawerTitle>Document details</DrawerTitle>
                <DrawerDescription id="document-detail-description">
                  Inspect metadata, reprocess, or delete this document.
                </DrawerDescription>
              </div>
              <DrawerClose
                aria-label="Close document details"
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Icon name="X" className="h-4 w-4" />
              </DrawerClose>
            </div>
          </DrawerHeader>

          <DrawerBody className="space-y-6">
            {isLoading ? (
              <div
                className="flex min-h-[200px] items-center justify-center"
                role="status"
                aria-live="polite"
              >
                <Spinner size="lg" />
              </div>
            ) : isError ? (
              <ErrorState
                title={
                  fe?.kind === "not_found"
                    ? "Document not found"
                    : "Couldn't load this document"
                }
                description={
                  fe?.kind === "not_found"
                    ? "It may have been deleted from another tab. Returning you to the list."
                    : fe?.message ?? "Please try again."
                }
                code={fe?.status ? String(fe.status) : undefined}
                onRetry={() => {
                  void refetch()
                }}
              />
            ) : data ? (
              <>
                <DocumentHeader document={data} />
                <DocumentMetadata document={data} />
              </>
            ) : null}
          </DrawerBody>

          {data ? (
            <DrawerFooter className="flex-wrap">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onCopyId(data)}
              >
                <Icon name="Copy" className="h-3.5 w-3.5" />
                <span>Copy ID</span>
              </Button>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setReprocessOpen(true)}
                  disabled={data.status === "parsing" || data.status === "chunking" || data.status === "embedding"}
                  title={
                    data.status === "parsing" ||
                    data.status === "chunking" ||
                    data.status === "embedding"
                      ? "Reprocess is unavailable while ingestion is in progress."
                      : undefined
                  }
                >
                  <Icon name="RotateCw" className="h-3.5 w-3.5" />
                  <span>Reprocess</span>
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Icon name="Trash" className="h-3.5 w-3.5" />
                  <span>Delete</span>
                </Button>
              </div>
            </DrawerFooter>
          ) : null}
        </DrawerContent>
      </Drawer>

      {data ? (
        <>
          <DeleteDocumentDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            documentId={data.id}
            documentTitle={data.title}
            onDeleted={() => {
              // Close the drawer so the user returns
              // to the list.
              closeDetail()
            }}
          />
          <ReprocessDocumentDialog
            open={reprocessOpen}
            onOpenChange={setReprocessOpen}
            documentId={data.id}
            documentTitle={data.title}
          />
        </>
      ) : null}
    </>
  )
}
