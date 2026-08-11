/**
 * listConversations — F5 Part 1.
 *
 * Verifies the api-client wiring for the new
 * `GET /conversations` list endpoint.
 */

import { afterEach, describe, expect, it, vi } from "vitest"

import { getApiClient } from "@/lib/auth/api-client"
import { listConversations } from "@/services/conversations"

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

describe("services/listConversations", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("GETs /api/v1/conversations with no query when called with empty params", async () => {
    const payload = { items: [], total: 0, limit: 50, offset: 0 }
    const get = vi.fn().mockResolvedValue(payload)
    getApiClientMock.mockReturnValue({ get } as never)

    await listConversations()

    expect(get).toHaveBeenCalledWith("/api/v1/conversations", {
      signal: undefined,
    })
  })

  it("forwards limit + offset as query params when provided", async () => {
    const get = vi.fn().mockResolvedValue({
      items: [],
      total: 0,
      limit: 25,
      offset: 50,
    })
    getApiClientMock.mockReturnValue({ get } as never)

    await listConversations({ limit: 25, offset: 50 })

    expect(get).toHaveBeenCalledWith("/api/v1/conversations", {
      query: { limit: 25, offset: 50 },
      signal: undefined,
    })
  })

  it("forwards only the provided pagination keys (not the undefined ones)", async () => {
    const get = vi.fn().mockResolvedValue({ items: [], total: 0 })
    getApiClientMock.mockReturnValue({ get } as never)

    await listConversations({ limit: 10 })

    expect(get).toHaveBeenCalledWith("/api/v1/conversations", {
      query: { limit: 10 },
      signal: undefined,
    })
  })

  it("forwards the abort signal to the api-client", async () => {
    const get = vi.fn().mockResolvedValue({ items: [], total: 0 })
    getApiClientMock.mockReturnValue({ get } as never)
    const controller = new AbortController()

    await listConversations({ signal: controller.signal })

    expect(get).toHaveBeenCalledWith("/api/v1/conversations", {
      signal: controller.signal,
    })
  })
})
