/**
 * ReprocessDocumentDialog — the confirmation dialog
 * for re-ingestion.
 *
 * **F3 Part 3 (Task 29).** Wraps the F1 `Dialog` +
 * a small "Reprocess document?" copy. Owns the
 * reprocess mutation + the success / error toasts.
 *
 * **Live status.** The backend bumps the version
 * + resets the status to `pending` async; the live
 * status progression is delivered by the WebSocket
 * (Part 4). Until then, the invalidate-on-success
 * covers the immediate "I queued this" feedback.
 *
 * **Controlled.** The parent controls `open` /
 * `onOpenChange`. The mutation invalidates
 * `["documents"]` on success; the parent can choose
 * to keep the drawer open so the user sees the
 * status flip.
 */

"use client"

import { type ReactNode, useState } from "react"

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  toast,
} from "@cortex/ui"

import { useInvalidateDocuments, useReprocessDocument } from "@/hooks/documents"

export interface ReprocessDocumentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  documentId: string
  documentTitle: string
  /** Failed documents are retried (`/retry`); indexed ones are reprocessed. */
  failed?: boolean
  /** Fired after a successful reprocess. */
  onReprocessed?: () => void
}

export function ReprocessDocumentDialog({
  open,
  onOpenChange,
  documentId,
  documentTitle,
  failed = false,
  onReprocessed,
}: ReprocessDocumentDialogProps): ReactNode {
  const [submitting, setSubmitting] = useState(false)
  const reprocessMutation = useReprocessDocument()
  const invalidate = useInvalidateDocuments()

  async function onConfirm() {
    if (submitting) return
    setSubmitting(true)
    const pending = toast({
      title: failed ? "Retrying…" : "Reprocessing…",
      description: documentTitle,
    })
    try {
      await reprocessMutation.mutateAsync({ id: documentId, retry: failed })
      pending.dismiss()
      toast({
        title: "Document queued",
        description: `${failed ? "Retry" : "Reprocessing"} started - status will update shortly.`,
        variant: "success",
      })
      await invalidate()
      onReprocessed?.()
      onOpenChange(false)
    } catch (err) {
      pending.dismiss()
      toast({
        title: failed ? "Retry failed" : "Reprocess failed",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting) return
        onOpenChange(next)
      }}
    >
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{failed ? "Retry document?" : "Reprocess document?"}</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{documentTitle}</span>{" "}
            {failed
              ? "will be queued for processing again."
              : "will be re-ingested from scratch. The current version stays searchable until the new version is indexed."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            data-loading={submitting || undefined}
          >
            {submitting ? (
              <>
                <Icon name="Loader" className="h-3.5 w-3.5 animate-spin" />
                <span>Reprocessing…</span>
              </>
            ) : (
              <>
                <Icon name="RotateCw" className="h-3.5 w-3.5" />
                <span>{failed ? "Retry" : "Reprocess"}</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
