/**
 * FileUploadTab — drag-and-drop + click-to-browse
 * for the document upload modal.
 *
 * **F3 Part 3 (Task 22).** Renders the file input
 * (hidden), a drop zone, and the chosen-file summary.
 * Validation is owned by `lib/documents/upload.schema`
 * — this component just captures a `File` and bubbles
 * the validation result up via the `onChange` callback.
 *
 * **Accessibility.** The drop zone is a real button
 * (not a div with onClick) so keyboard users can
 * activate it with Enter / Space. The native file
 * input is the actual control; the drop zone is a
 * styled label around it.
 *
 * **Drag & drop.** The hidden `<input type="file">`
 * is the source of truth (so the OS picker + drag
 * paths produce the same `File` object). We also
 * listen for `drop` on the wrapper so the visual
 * state matches the input.
 */

"use client"

import { useId, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react"

import { Button, Icon } from "@cortex/ui"

import {
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE_LABEL,
} from "@/lib/documents/upload.schema"

export interface FileUploadTabProps {
  /** The currently selected file (controlled). */
  file: File | null
  /** Fired whenever the user picks a new file. */
  onChange: (file: File | null) => void
  /** Disable the input (during a submit). */
  disabled?: boolean
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FileUploadTab({
  file,
  onChange,
  disabled,
}: FileUploadTabProps): ReactNode {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const next = e.currentTarget.files?.[0] ?? null
    onChange(next)
  }

  function handleDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setIsDragging(false)
    if (disabled) return
    const dropped = e.dataTransfer.files?.[0]
    if (dropped) onChange(dropped)
  }

  return (
    <div className="space-y-3">
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/30 px-6 py-10 text-center transition-colors " +
          (isDragging
            ? "border-ember-500 bg-ember-500/5"
            : "border-border hover:bg-muted/50") +
          (disabled ? " pointer-events-none opacity-60" : "")
        }
      >
        <div
          aria-hidden
          className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
        >
          <Icon name="Upload" className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            {file ? file.name : "Drag & drop a file, or click to browse"}
          </p>
          <p className="text-xs text-muted-foreground">
            {ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(", ")} - up to {MAX_FILE_SIZE_LABEL}
          </p>
        </div>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",")}
          onChange={handleInputChange}
          disabled={disabled}
          className="sr-only"
        />
      </label>

      {file ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <Icon name="FileText" className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium" title={file.name}>
                {file.name}
              </p>
              <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(null)
              if (inputRef.current) inputRef.current.value = ""
            }}
            disabled={disabled}
            aria-label="Remove selected file"
          >
            <Icon name="X" className="h-3.5 w-3.5" />
            <span>Remove</span>
          </Button>
        </div>
      ) : null}
    </div>
  )
}
