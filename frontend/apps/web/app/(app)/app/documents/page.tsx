/**
 * Documents list — `/app/documents`.
 *
 * Server-side initial fetch is intentionally not implemented
 * here; the table hydrates on the client via TanStack Query so
 * uploads, status changes, and live ingestion badges can update
 * without a full page reload.
 */
"use client"

import { useState } from "react"

import { DocumentUploadModal } from "@/components/documents/upload-modal"
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@cortex/ui"

export default function DocumentsPage() {
  const [uploadOpen, setUploadOpen] = useState(false)

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Documents</h1>
          <p className="text-sm text-muted-foreground">
            Upload, search, and inspect every document in your tenant.
          </p>
        </div>
        <Button variant="spark" onClick={() => setUploadOpen(true)}>
          Upload
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>All documents</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Document list will render here once the API client is generated via{" "}
            <code className="font-mono">pnpm codegen</code>.
            <div className="mt-4 flex justify-center gap-2">
              <Badge variant="pending">pending</Badge>
              <Badge variant="processing">processing</Badge>
              <Badge variant="completed">completed</Badge>
              <Badge variant="failed">failed</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
      <DocumentUploadModal open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  )
}
