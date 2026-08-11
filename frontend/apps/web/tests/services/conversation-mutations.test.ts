/**
 * renameConversation + deleteConversation — F5 Part 2.
 *
 * Verifies the api-client wiring for the new
 * PATCH + DELETE endpoints. The backend's
 * PATCH route ships with F5 P2; DELETE has
 * been on the backend since V3.
 */

import { afterEach, describe, expect, it, vi } from "vitest"

import { getApiClient } from "@/lib/auth/api-client"
import {
  deleteConversation,
  renameConversation,
} from "@/services/conversations"

vi.mock("@/lib/auth/api-client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/auth/api-client")>(
      "@/lib/auth/api-client",
    )
  return { ...actual, getApiClient: vi.fn(), resetApiClient: vi.fn() }
})

const getApiClientMock = vi.mocked(getApiClient)

describe("services/renameConversation", () => {
  afterEach(() => vi.clearAllMocks())

  it("PATCHes /api/v1/conversations/{id} with the title", async () => {
    const updated = {
      id: "c-1",
      tenantId: "t-1",
      userId: "u-1",
      title: "New title",
      summary: null,
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-02T00:00:00.000Z",
    }
    const patch = vi.fn().mockResolvedValue(updated)
    getApiClientMock.mockReturnValue({ patch } as never)

    const result = await renameConversation({
      id: "c-1",
      title: "New title",
    })

    expect(patch).toHaveBeenCalledWith("/api/v1/conversations/c-1", {
      title: "New title",
    })
    expect(result).toEqual(updated)
  })

  it("URL-encodes ids with special characters", async () => {
    const patch = vi.fn().mockResolvedValue({})
    getApiClientMock.mockReturnValue({ patch } as never)

    await renameConversation({ id: "a/b c", title: "t" })

    expect(patch).toHaveBeenCalledWith("/api/v1/conversations/a%2Fb%20c", {
      title: "t",
    })
  })

  it("propagates backend errors", async () => {
    const patch = vi.fn().mockRejectedValue(new Error("title required"))
    getApiClientMock.mockReturnValue({ patch } as never)

    await expect(
      renameConversation({ id: "c-1", title: "" }),
    ).rejects.toThrow("title required")
  })
})

describe("services/deleteConversation", () => {
  afterEach(() => vi.clearAllMocks())

  it("DELETEs /api/v1/conversations/{id}", async () => {
    const del = vi.fn().mockResolvedValue(undefined)
    getApiClientMock.mockReturnValue({ delete: del } as never)

    await deleteConversation({ id: "c-1" })

    expect(del).toHaveBeenCalledWith("/api/v1/conversations/c-1")
  })

  it("URL-encodes ids with special characters", async () => {
    const del = vi.fn().mockResolvedValue(undefined)
    getApiClientMock.mockReturnValue({ delete: del } as never)

    await deleteConversation({ id: "a/b c" })

    expect(del).toHaveBeenCalledWith("/api/v1/conversations/a%2Fb%20c")
  })

  it("propagates backend errors", async () => {
    const del = vi
      .fn()
      .mockRejectedValue(new Error("conversation not found"))
    getApiClientMock.mockReturnValue({ delete: del } as never)

    await expect(
      deleteConversation({ id: "missing" }),
    ).rejects.toThrow("conversation not found")
  })
})
