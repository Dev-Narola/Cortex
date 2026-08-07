/**
 * DeleteDocumentDialog — the confirmation dialog
 * for document deletion.
 *
 * **F3 Part 3 (Task 28).** Wraps the F1 `Dialog` +
 * a small "Delete document?" copy. Owns the delete
 * mutation + the success / error toasts. Returns
 * the user to the list (closes the detail drawer)
 * after a successful delete.
 *
 * **Controlled.** The parent controls `open` /
 * `onOpenChange`. The parent is also responsible
 * for closing the detail drawer on success; this
 * component fires `onDeleted` so the parent can do
 * that.
 *
 * **No optimistic delete.** Deletion is irreversible
 * on the backend; we wait for the 2xx before letting
 * the parent close the drawer. The mutation also
 * invalidates the `["documents"]` query so the table
 * drops the row on the next refetch.
 */

"use client"

import { useState, type ReactNode } from "react"

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

import {
  useDeleteDocument,
  useInvalidateDocuments,
} from "@/hooks/documents"

export interface DeleteDocumentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  documentId: string
  documentTitle: string
  /** Fired after a successful delete. */
  onDeleted?: () => void
}

export function DeleteDocumentDialog({
  open,
  onOpenChange,
  documentId,
  documentTitle,
  onDeleted,
}: DeleteDocumentDialogProps): ReactNode {
  const [submitting, setSubmitting] = useState(false)
  const deleteMutation = useDeleteDocument()
  const invalidate = useInvalidateDocuments()

  async function onConfirm() {
    if (submitting) return
    setSubmitting(true)
    const pending = toast({
      title: "Deleting document…",
      description: documentTitle,
    })
    try {
      await deleteMutation.mutateAsync({ id: documentId })
      pending.dismiss()
      toast({
        title: "Document deleted",
        description: documentTitle,
        variant: "success",
      })
      await invalidate()
      onDeleted?.()
      onOpenChange(false)
    } catch (err) {
      pending.dismiss()
      toast({
        title: "Delete failed",
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
          <DialogTitle>Delete document?</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{documentTitle}</span>{" "}
            will be removed from your workspace. This action cannot be undone.
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
            variant="destructive"
            onClick={onConfirm}
            disabled={submitting}
            data-loading={submitting || undefined}
          >
            {submitting ? (
              <>
                <Icon name="Loader" className="h-3.5 w-3.5 animate-spin" />
                <span>Deleting…</span>
              </>
            ) : (
              <>
                <Icon name="Trash" className="h-3.5 w-3.5" />
                <span>Delete</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
