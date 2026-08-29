/**
 * UploadDocumentModal — the F3 upload modal.
 *
 * **F3 Part 3 (Task 21).** The reusable upload surface
 * that the Documents page + the future Dashboard
 * Quick Action both mount. Owns:
 *   - Open/close state (controlled).
 *   - Tabs (File / URL).
 *   - Form validation via `lib/documents/upload.schema`.
 *   - Submit (POST /documents via the upload mutation).
 *   - Success + error toasts.
 *   - Reset on close.
 *
 * **Reusability.** The modal takes an `open` +
 * `onOpenChange` prop pair and fires a `onUploaded`
 * callback when the upload succeeds. The caller is
 * responsible for invalidating its own data and
 * closing the modal; the modal only owns the form
 * lifecycle.
 *
 * **The "URL tab is a placeholder" decision.** The
 * backend currently has no `POST /api/v1/documents/url`
 * endpoint. We render the tab + collect the URL +
 * validate it, then show a "Coming soon" toast on
 * submit. The form is wired so the future endpoint
 * is a one-line change in the submit handler.
 *
 * **No business logic outside this file.** State
 * lives here; hooks live in `@/hooks/documents`; the
 * schema lives in `@/lib/documents`.
 */

"use client"

import { type ReactNode, useEffect, useState } from "react"

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from "@cortex/ui"

import { useInvalidateDocuments, useUploadDocument } from "@/hooks/documents"
import { fileUploadSchema, urlUploadSchema } from "@/lib/documents/upload.schema"

import { FileUploadTab } from "./FileUploadTab"
import { UrlUploadTab } from "./UrlUploadTab"

import { DOCUMENT_UPLOADED, track } from "@/lib/analytics"

export interface UploadDocumentModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Optional callback fired after a successful upload. */
  onUploaded?: (id: string) => void
}

type Tab = "file" | "url"

export function UploadDocumentModal({
  open,
  onOpenChange,
  onUploaded,
}: UploadDocumentModalProps): ReactNode {
  const [tab, setTab] = useState<Tab>("file")
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState("")
  const [fileError, setFileError] = useState<string | null>(null)
  const [urlError, setUrlError] = useState<string | null>(null)
  const [abortController, setAbortController] = useState<AbortController | null>(null)

  const upload = useUploadDocument()
  const invalidate = useInvalidateDocuments()

  // Reset the form when the modal opens or closes.
  useEffect(() => {
    if (!open) {
      setFile(null)
      setUrl("")
      setFileError(null)
      setUrlError(null)
      setTab("file")
    }
  }, [open])

  async function onSubmit() {
    if (tab === "file") {
      const result = fileUploadSchema.safeParse({ kind: "file", file })
      if (!result.success) {
        setFileError(result.error.issues[0]?.message ?? "Invalid file.")
        return
      }
      setFileError(null)

      const controller = new AbortController()
      setAbortController(controller)
      const pending = toast({
        title: "Uploading document…",
        description: result.data.file.name,
      })
      try {
        const accepted = await upload.mutateAsync({
          file: result.data.file,
          signal: controller.signal,
        })
        pending.dismiss()
        toast({
          title: "Upload successful",
          description: "Your document is queued for processing.",
          variant: "success",
        })
        // F10-Part 4: document_uploaded fires
        // on the success path. The file
        // type is included (pdf / docx / etc.)
        // for funnel analysis; the file name
        // is deliberately NOT included —
        // filenames can leak project names,
        // customer names, etc.
        track(DOCUMENT_UPLOADED, {
          source: "file",
          file_type: result.data.file.type || "unknown",
        })
        await invalidate()
        onUploaded?.(accepted.id)
        onOpenChange(false)
      } catch (err) {
        pending.dismiss()
        if (controller.signal.aborted) {
          toast({
            title: "Upload cancelled",
            variant: "default",
          })
        } else {
          toast({
            title: "Upload failed",
            description: err instanceof Error ? err.message : "Try again.",
            variant: "destructive",
          })
        }
      } finally {
        setAbortController(null)
      }
    } else {
      // URL tab — backend endpoint not available yet.
      // Validate, then surface a clear "coming soon" toast.
      const result = urlUploadSchema.safeParse({ kind: "url", url })
      if (!result.success) {
        setUrlError(result.error.issues[0]?.message ?? "Invalid URL.")
        return
      }
      setUrlError(null)
      toast({
        title: "URL ingestion - coming soon",
        description:
          "The backend doesn't expose a URL-ingestion endpoint yet. We're shipping the form so the rollout is a one-line change.",
        variant: "default",
      })
    }
  }

  const isUploading = upload.isPending
  const isDisabled = isUploading

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isUploading) return // don't close mid-upload
        onOpenChange(next)
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Upload document</DialogTitle>
          <DialogDescription>
            Drop a file or paste a URL. The document is queued for processing and appears in your
            list as soon as ingestion starts.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="file" disabled={isDisabled}>
              <Icon name="FileText" className="mr-1.5 h-3.5 w-3.5" />
              File
            </TabsTrigger>
            <TabsTrigger value="url" disabled={isDisabled}>
              <Icon name="Link" className="mr-1.5 h-3.5 w-3.5" />
              URL
            </TabsTrigger>
          </TabsList>
          <TabsContent value="file" className="mt-4">
            <FileUploadTab
              file={file}
              onChange={(f) => {
                setFile(f)
                if (fileError) setFileError(null)
              }}
              disabled={isDisabled}
            />
            {fileError ? (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {fileError}
              </p>
            ) : null}
          </TabsContent>
          <TabsContent value="url" className="mt-4">
            <UrlUploadTab
              value={url}
              onChange={(v) => {
                setUrl(v)
                if (urlError) setUrlError(null)
              }}
              error={urlError}
              disabled={isDisabled}
            />
          </TabsContent>
        </Tabs>

        <DialogFooter>
          {isUploading ? (
            <Button type="button" variant="ghost" onClick={() => abortController?.abort()}>
              Cancel
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
          <Button
            type="button"
            onClick={onSubmit}
            disabled={isDisabled || (tab === "file" ? !file : !url)}
            data-loading={isDisabled || undefined}
          >
            {isUploading ? (
              <>
                <Icon name="Loader" className="h-3.5 w-3.5 animate-spin" />
                <span>Uploading…</span>
              </>
            ) : (
              <>
                <Icon name="Upload" className="h-3.5 w-3.5" />
                <span>Upload</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
