/**
 * UrlUploadTab — single-URL input for the upload
 * modal.
 *
 * **F3 Part 3 (Task 22).** Captures a URL + validates
 * it via `lib/documents/upload.schema`.
 *
 * **Backend.** Submitted to `POST /api/v1/documents/url`
 * by the modal; the server fetches and queues the page.
 *
 * **Validation.** Zod runs on change + on submit;
 * errors render below the input in the F1
 * form-error style.
 */

"use client"

import { type ReactNode, useId } from "react"

import { Icon, Input, Label, Text } from "@cortex/ui"

export interface UrlUploadTabProps {
  value: string
  onChange: (value: string) => void
  error?: string | null
  disabled?: boolean
}

export function UrlUploadTab({ value, onChange, error, disabled }: UrlUploadTabProps): ReactNode {
  const id = useId()
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Document URL</Label>
      <div className="relative">
        <Icon
          name="Link"
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id={id}
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://example.com/spec.pdf"
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          disabled={disabled}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="h-10 pl-8"
        />
      </div>
      {error ? (
        <Text id={`${id}-error`} tone="destructive" size="sm" role="alert">
          {error}
        </Text>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Paste a public https:// URL. PDF, DOCX, TXT, or Markdown only.
      </p>
    </div>
  )
}
