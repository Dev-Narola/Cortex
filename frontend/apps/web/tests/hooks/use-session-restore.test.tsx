/**
 * Unit tests for `useSessionRestore` hook.
 */

import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useSessionRestore } from "@/hooks/auth/useSessionRestore"
import { useAuthStore } from "@/lib/auth/store"

vi.mock("@/services/auth/refresh", () => ({
  refresh: vi.fn(),
}))

import { refresh } from "@/services/auth/refresh"

describe("useSessionRestore", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    useAuthStore.getState().clear()
  })

  afterEach(() => {
    useAuthStore.getState().clear()
  })

  it("marks session restored immediately if access token is valid and unexpired", async () => {
    useAuthStore.setState({
      hydrated: true,
      accessToken: "valid-token",
      expiresAt: Date.now() + 100_000,
    })

    const { result } = renderHook(() => useSessionRestore())

    await waitFor(() => {
      expect(result.current.restored).toBe(true)
    })

    expect(result.current.isRestoring).toBe(false)
    expect(refresh).not.toHaveBeenCalled()
  })

  it("attempts silent refresh when token is expired", async () => {
    vi.mocked(refresh).mockResolvedValueOnce({
      access_token: "new-jwt",
      token_type: "bearer",
      expires_in: 3600,
    })

    useAuthStore.setState({
      hydrated: true,
      accessToken: "old-expired-token",
      expiresAt: Date.now() - 1000,
    })

    const { result } = renderHook(() => useSessionRestore())

    await waitFor(() => {
      expect(refresh).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(result.current.restored).toBe(true)
    })

    expect(useAuthStore.getState().accessToken).toBe("new-jwt")
  })

  it("clears auth store on refresh failure", async () => {
    vi.mocked(refresh).mockRejectedValueOnce(new Error("Unauthorized"))

    useAuthStore.setState({
      hydrated: true,
      accessToken: "invalid-token",
      expiresAt: Date.now() - 1000,
    })

    const { result } = renderHook(() => useSessionRestore())

    await waitFor(() => {
      expect(result.current.restored).toBe(true)
    })

    expect(useAuthStore.getState().accessToken).toBeNull()
  })
})
