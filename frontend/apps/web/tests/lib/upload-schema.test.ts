/**
 * upload.schema — F3 Part 3 (Task 23).
 *
 * Mirrors the backend's allowlist + size cap so the
 * UI can surface errors before a round-trip.
 */

import { describe, expect, it } from "vitest"

import {
  ALLOWED_EXTENSIONS,
  fileUploadSchema,
  MAX_FILE_SIZE_BYTES,
  urlUploadSchema,
} from "@/lib/documents/upload.schema"

function makeFile(name: string, size: number, type = "text/plain"): File {
  // Construct a File the way the browser would.
  // The TS File constructor isn't fully typed in
  // happy-dom; cast through `unknown`.
  const blob = new Blob([new Uint8Array(size)], { type })
  return new File([blob], name, { type })
}

describe("fileUploadSchema", () => {
  it("accepts a supported file under the size cap", () => {
    const result = fileUploadSchema.safeParse({
      kind: "file",
      file: makeFile("doc.pdf", 1024, "application/pdf"),
    })
    expect(result.success).toBe(true)
  })

  it("rejects an unsupported extension", () => {
    const result = fileUploadSchema.safeParse({
      kind: "file",
      file: makeFile("virus.exe", 1024, "application/octet-stream"),
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/unsupported file type/i)
    }
  })

  it("rejects an empty file", () => {
    const result = fileUploadSchema.safeParse({
      kind: "file",
      file: makeFile("empty.txt", 0, "text/plain"),
    })
    expect(result.success).toBe(false)
  })

  it(`rejects files over ${MAX_FILE_SIZE_BYTES} bytes`, () => {
    const result = fileUploadSchema.safeParse({
      kind: "file",
      file: makeFile("huge.pdf", MAX_FILE_SIZE_BYTES + 1, "application/pdf"),
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/too large/i)
    }
  })

  it("rejects a missing file", () => {
    const result = fileUploadSchema.safeParse({ kind: "file", file: null })
    expect(result.success).toBe(false)
  })
})

describe("urlUploadSchema", () => {
  it("accepts a valid https URL", () => {
    const result = urlUploadSchema.safeParse({
      kind: "url",
      url: "https://example.com/spec.pdf",
    })
    expect(result.success).toBe(true)
  })

  it("rejects an http URL", () => {
    const result = urlUploadSchema.safeParse({
      kind: "url",
      url: "http://example.com/spec.pdf",
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/https/i)
    }
  })

  it("rejects a malformed URL", () => {
    const result = urlUploadSchema.safeParse({
      kind: "url",
      url: "not a url",
    })
    expect(result.success).toBe(false)
  })

  it("rejects an empty URL", () => {
    const result = urlUploadSchema.safeParse({ kind: "url", url: "" })
    expect(result.success).toBe(false)
  })
})

describe("ALLOWED_EXTENSIONS", () => {
  it("exposes the backend allowlist", () => {
    expect(ALLOWED_EXTENSIONS).toEqual(["pdf", "docx", "txt", "md"])
  })
})
