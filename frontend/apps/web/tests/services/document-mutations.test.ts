/**
 * Document mutation services — F3 Part 3 (Task 24 + 28 + 29).
 *
 * Verifies the api-client wiring for the three new
 * endpoints (upload / delete / reprocess). The
 * api-client detects FormData and skips the JSON
 * Content-Type header, so we exercise that path
 * explicitly.
 */

import { afterEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@cortex/api-client"

import { getApiClient } from "@/lib/auth/api-client"
import {
  deleteDocument,
  reprocessDocument,
  uploadDocument,
} from "@/services/documents"

vi.mock("@/lib/auth/api-client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/auth/api-client")>(
      "@/lib/auth/api-client",
    )
  return {
    ...actual,
    getApiClient: vi.fn(),
    resetApiClient: vi.fn(),
  }
})

const getApiClientMock = vi.mocked(getApiClient)

describe("services/documents mutations", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("uploadDocument", () => {
    it("POSTs to /api/v1/documents with a FormData body", async () => {
      const post = vi.fn().mockResolvedValue({
        id: "new-id",
        status: "pending",
        message: "Document queued for processing",
      })
      getApiClientMock.mockReturnValue({ post } as never)

      const file = new File(["hello"], "hello.txt", { type: "text/plain" })
      const result = await uploadDocument({ file })

      expect(post).toHaveBeenCalledTimes(1)
      const [path, body, init] = post.mock.calls[0] ?? []
      expect(path).toBe("/api/v1/documents")
      expect(body).toBeInstanceOf(FormData)
      const form = body as FormData
      const appended = form.get("file") as File
      // happy-dom wraps the appended file in a new
      // File instance so we compare the metadata
      // rather than the object identity.
      expect(appended.name).toBe(file.name)
      expect(appended.size).toBe(file.size)
      expect(appended.type).toBe(file.type)
      expect(init).toEqual({}) // no signal passed
      expect(result).toEqual({
        id: "new-id",
        status: "pending",
        message: "Document queued for processing",
      })
    })

    it("forwards an AbortSignal to the request", async () => {
      const post = vi.fn().mockResolvedValue({ id: "x", status: "pending" })
      getApiClientMock.mockReturnValue({ post } as never)

      const controller = new AbortController()
      const file = new File(["x"], "x.txt", { type: "text/plain" })
      await uploadDocument({ file, signal: controller.signal })

      const init = post.mock.calls[0]?.[2] as { signal?: AbortSignal } | undefined
      expect(init?.signal).toBe(controller.signal)
    })

    it("propagates api-client errors", async () => {
      const post = vi
        .fn()
        .mockRejectedValue(
          new ApiError(413, { message: "Payload too large" }),
        )
      getApiClientMock.mockReturnValue({ post } as never)

      const file = new File(["x"], "x.txt", { type: "text/plain" })
      await expect(uploadDocument({ file })).rejects.toBeInstanceOf(ApiError)
    })
  })

  describe("deleteDocument", () => {
    it("DELETEs /api/v1/documents/{id}", async () => {
      const del = vi.fn().mockResolvedValue(undefined)
      getApiClientMock.mockReturnValue({ delete: del } as never)

      await deleteDocument({ id: "d-1" })

      expect(del).toHaveBeenCalledWith("/api/v1/documents/d-1", {
        signal: undefined,
      })
    })

    it("URL-encodes ids with special characters", async () => {
      const del = vi.fn().mockResolvedValue(undefined)
      getApiClientMock.mockReturnValue({ delete: del } as never)

      await deleteDocument({ id: "a/b" })

      expect(del).toHaveBeenCalledWith("/api/v1/documents/a%2Fb", {
        signal: undefined,
      })
    })
  })

  describe("reprocessDocument", () => {
    it("POSTs to /api/v1/documents/{id}/reprocess", async () => {
      const post = vi
        .fn()
        .mockResolvedValue({ message: "Document queued for reprocessing." })
      getApiClientMock.mockReturnValue({ post } as never)

      const result = await reprocessDocument({ id: "d-1" })

      expect(post).toHaveBeenCalledWith(
        "/api/v1/documents/d-1/reprocess",
        undefined,
        { signal: undefined },
      )
      expect(result.message).toMatch(/queued for reprocessing/i)
    })
  })
})
