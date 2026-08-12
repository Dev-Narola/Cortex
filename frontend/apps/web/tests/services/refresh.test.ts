/**
 * `refresh` — V11 hotfix regression test.
 *
 * The backend's `POST /api/v1/auth/refresh` expects a
 * JSON body with the refresh token:
 *   { refresh_token: str }
 *
 * The previous version of this service sent an empty
 * body, which the backend rejected with 422. The
 * `useSessionRestore` hook treated that as a refresh
 * failure, called `logout()`, and the user was
 * permanently bounced to `/login` on every hard
 * refresh.
 *
 * These tests pin the contract: the body must be
 * `{ refresh_token }` populated from the auth store.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { getApiClient } from "@/lib/auth/api-client"
import { refresh } from "@/services/auth/refresh"
import { useAuthStore } from "@/lib/auth/store"

vi.mock("@/lib/auth/api-client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/auth/api-client")>(
      "@/lib/auth/api-client",
    )
  return { ...actual, getApiClient: vi.fn(), resetApiClient: vi.fn() }
})

const getApiClientMock = vi.mocked(getApiClient)

describe("services/refresh", () => {
  beforeEach(() => {
    // Reset the auth store to a known empty state
    // so each test starts from a clean slate.
    useAuthStore.getState().clear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("POSTs { refresh_token } to /api/v1/auth/refresh", async () => {
    // Seed the auth store with a refresh token.
    useAuthStore.setState({ refreshToken: "rt-test-1234567890" })

    const post = vi.fn().mockResolvedValue({
      access_token: "at-new",
      token_type: "bearer",
      expires_in: 1800,
    })
    getApiClientMock.mockReturnValue({ post } as never)

    const data = await refresh()

    expect(post).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledWith(
      "/api/v1/auth/refresh",
      { refresh_token: "rt-test-1234567890" },
    )
    expect(data.access_token).toBe("at-new")
  })

  it("throws when no refresh token is in the store", async () => {
    // No refresh token seeded — the store is empty
    // after the beforeEach reset. The service MUST
    // refuse to fire a malformed request.
    const post = vi.fn()
    getApiClientMock.mockReturnValue({ post } as never)

    await expect(refresh()).rejects.toThrow(
      "No refresh token available",
    )
    expect(post).not.toHaveBeenCalled()
  })

  it("propagates backend errors", async () => {
    useAuthStore.setState({ refreshToken: "rt-test-1234567890" })

    getApiClientMock.mockReturnValue({
      post: vi.fn().mockRejectedValue(new Error("401 invalid token")),
    } as never)

    await expect(refresh()).rejects.toThrow("401 invalid token")
  })
})
