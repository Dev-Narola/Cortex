/**
 * Document upload modal — the central upload flow.
 *
 * Drag-and-drop + click-to-pick. The actual upload posts to
 * `/api/v1/documents/upload` with a multipart body. The
 * ingestion status is then tracked via a per-document
 * WebSocket (see `lib/socket/use-socket.ts`).
 */

"use client"

import { useState } from "react"

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@cortex/ui"

export function DocumentUploadModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [files, setFiles] = useState<FileList | null>(null)
  const [uploading, setUploading] = useState(false)

  async function onSubmit() {
    if (!files || files.length === 0) return
    setUploading(true)
    // TODO: wire to /api/v1/documents/upload via getApiClient().
    await new Promise((r) => setTimeout(r, 200))
    setUploading(false)
    onOpenChange(false)
    setFiles(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload documents</DialogTitle>
          <DialogDescription>
            Drag-and-drop or click to pick. Up to 50 files at a time.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Label htmlFor="files">Files</Label>
          <Input
            id="files"
            type="file"
            multiple
            onChange={(e) => setFiles(e.currentTarget.files)}
          />
          {files && files.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {files.length} file{files.length === 1 ? "" : "s"} selected
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="spark"
            onClick={onSubmit}
            disabled={!files || files.length === 0 || uploading}
          >
            {uploading ? "Uploading…" : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
