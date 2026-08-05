/**
 * useCreateWorkspace — TanStack Query mutation hook.
 *
 * **F2 Part 2 (Task 16).** Wraps `createTenant` in
 * `useMutation`. The hook is the only place the
 * component should call the service.
 *
 * Covers:
 *   - Calls the api-client's post with the right URL.
 *   - Surfaces the response.
 *   - Exposes isPending / isError / isSuccess states.
 *   - Surfaces 409 + 5xx errors.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ApiError } from "@cortex/api-client"
import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useCreateWorkspace } from "@/hooks/onboarding"

const postMock = vi.fn()

vi.mock("@/lib/auth/api-client", () => ({
  getApiClient: () => ({ post: postMock }),
}))

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

describe("useCreateWorkspace", () => {
  beforeEach(() => {
    postMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("calls POST /tenants and resolves with the tenant", async () => {
    const created = {
      id: "t-1",
      slug: "acme",
      name: "Acme Inc",
    }
    postMock.mockResolvedValueOnce(created)
    const { result } = renderHook(() => useCreateWorkspace(), {
      wrapper: makeWrapper(),
    })

    await act(async () => {
      await result.current.mutateAsync({ name: "Acme Inc", slug: "acme" })
    })

    expect(postMock).toHaveBeenCalledWith("/api/v1/tenants", {
      name: "Acme Inc",
      slug: "acme",
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(created)
  })

  it("surfaces 409 (duplicate slug) as an Error on the mutation", async () => {
    postMock.mockRejectedValueOnce(
      new ApiError(409, { message: "Slug already in use" }),
    )
    const { result } = renderHook(() => useCreateWorkspace(), {
      wrapper: makeWrapper(),
    })

    await act(async () => {
      try {
        await result.current.mutateAsync({ name: "Acme", slug: "taken" })
      } catch {
        // expected
      }
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(ApiError)
    expect((result.current.error as ApiError).status).toBe(409)
  })

  it("surfaces 5xx as an Error on the mutation", async () => {
    postMock.mockRejectedValueOnce(
      new ApiError(500, { message: "Internal Server Error" }),
    )
    const { result } = renderHook(() => useCreateWorkspace(), {
      wrapper: makeWrapper(),
    })

    await act(async () => {
      try {
        await result.current.mutateAsync({ name: "Acme", slug: "acme" })
      } catch {
        // expected
      }
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(ApiError)
    expect((result.current.error as ApiError).status).toBe(500)
  })

  it("starts in the pending=false state", () => {
    const { result } = renderHook(() => useCreateWorkspace(), {
      wrapper: makeWrapper(),
    })
    expect(result.current.isPending).toBe(false)
    expect(result.current.isError).toBe(false)
    expect(result.current.isSuccess).toBe(false)
  })
})
