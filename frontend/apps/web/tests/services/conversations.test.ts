/**
 * Conversation services — F4 Part 1 (Task 4).
 *
 * Verifies the api-client wiring for the three
 * conversation REST endpoints the chat screen
 * consumes in Part 1. POST /messages + the WS
 * land in Part 2.
 */

import { afterEach, describe, expect, it, vi } from "vitest"

import { getApiClient } from "@/lib/auth/api-client"
import {
  createConversation,
  getConversation,
  getConversationMessages,
} from "@/services/conversations"

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

describe("services/conversations", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("createConversation", () => {
    it("POSTs to /api/v1/conversations with the title", async () => {
      const post = vi.fn().mockResolvedValue({
        id: "c-1",
        tenantId: "t-1",
        userId: "u-1",
        title: "New conversation",
        summary: null,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
      })
      getApiClientMock.mockReturnValue({ post } as never)

      const result = await createConversation({ title: "New conversation" })

      // The service only passes the body — `init`
      // (the third `post` arg) is omitted.
      expect(post).toHaveBeenCalledWith("/api/v1/conversations", {
        title: "New conversation",
      })
      expect(result.id).toBe("c-1")
    })

    it("propagates backend errors", async () => {
      const post = vi
        .fn()
        .mockRejectedValue(new Error("title required"))
      getApiClientMock.mockReturnValue({ post } as never)

      await expect(
        createConversation({ title: "" }),
      ).rejects.toThrow("title required")
    })
  })

  describe("getConversation", () => {
    it("GETs /api/v1/conversations/{id}", async () => {
      const payload = {
        id: "c-1",
        tenantId: "t-1",
        userId: "u-1",
        title: "Architecture",
        summary: null,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
        messages: [],
      }
      const get = vi.fn().mockResolvedValue(payload)
      getApiClientMock.mockReturnValue({ get } as never)

      const result = await getConversation({ id: "c-1" })

      expect(get).toHaveBeenCalledWith("/api/v1/conversations/c-1", {
        signal: undefined,
      })
      expect(result).toEqual(payload)
    })

    it("URL-encodes ids with special characters", async () => {
      const get = vi.fn().mockResolvedValue({ id: "a/b" })
      getApiClientMock.mockReturnValue({ get } as never)

      await getConversation({ id: "a/b" })

      expect(get).toHaveBeenCalledWith("/api/v1/conversations/a%2Fb", {
        signal: undefined,
      })
    })
  })

  describe("getConversationMessages", () => {
    it("GETs /api/v1/conversations/{id}/messages with a default limit", async () => {
      const get = vi.fn().mockResolvedValue([])
      getApiClientMock.mockReturnValue({ get } as never)

      await getConversationMessages({ id: "c-1" })

      expect(get).toHaveBeenCalledWith(
        "/api/v1/conversations/c-1/messages",
        { query: { limit: 200 }, signal: undefined },
      )
    })

    it("accepts a custom limit", async () => {
      const get = vi.fn().mockResolvedValue([])
      getApiClientMock.mockReturnValue({ get } as never)

      await getConversationMessages({ id: "c-1", limit: 50 })

      expect(get).toHaveBeenCalledWith(
        "/api/v1/conversations/c-1/messages",
        { query: { limit: 50 }, signal: undefined },
      )
    })
  })
})
