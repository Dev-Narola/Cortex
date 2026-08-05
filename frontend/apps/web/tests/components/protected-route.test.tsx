/**
 * ProtectedRoute — redirect behaviour (F2 Part 1, Task 10).
 *
 * Renders the component with three states:
 *   - hydrated + authenticated → children render
 *   - hydrated + unauthenticated → redirect to /login
 *   - not yet hydrated → loading shell renders
 *
 * Uses happy-dom + a controllable auth-store state.
 * The router is mocked to a no-op so we can assert the
 * `replace` call without actually navigating.
 */

import { render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const replaceMock = vi.fn()
const pushMock = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
  useSearchParams: () => new URLSearchParams(),
}))

import { ProtectedRoute } from "@/components/auth"
import { useAuthStore } from "@/lib/auth/store"

describe("ProtectedRoute", () => {
  beforeEach(() => {
    replaceMock.mockReset()
    pushMock.mockReset()
    useAuthStore.getState().clear()
    useAuthStore.setState({ hydrated: true })
  })

  afterEach(() => {
    useAuthStore.getState().clear()
  })

  it("renders the loading shell when not yet hydrated", () => {
    useAuthStore.setState({ hydrated: false })
    render(
      <ProtectedRoute>
        <div>secret content</div>
      </ProtectedRoute>,
    )
    expect(screen.getByText("Restoring your session…")).toBeInTheDocument()
    expect(screen.queryByText("secret content")).not.toBeInTheDocument()
  })

  it("renders the children when authenticated", () => {
    useAuthStore.setState({
      hydrated: true,
      accessToken: "jwt-1",
      refreshToken: "rt-1",
      user: {
        id: "u",
        email: "a@b.c",
        role: "owner",
        tenantId: "t",
      },
      tenant: { id: "t", slug: "acme", name: "Acme" },
      expiresAt: Date.now() + 60_000,
    })
    render(
      <ProtectedRoute>
        <div>secret content</div>
      </ProtectedRoute>,
    )
    expect(screen.getByText("secret content")).toBeInTheDocument()
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it("redirects to /login when unauthenticated", async () => {
    render(
      <ProtectedRoute>
        <div>secret content</div>
      </ProtectedRoute>,
    )
    // The effect runs after mount; happy-dom flushes
    // microtasks synchronously enough for us to assert
    // immediately on the next tick.
    await Promise.resolve()
    expect(replaceMock).toHaveBeenCalledTimes(1)
    const calledWith = replaceMock.mock.calls[0]?.[0] as string
    expect(calledWith).toMatch(/^\/login/)
    expect(calledWith).toContain("next=")
  })

  it("redirects to the configured loginPath", async () => {
    render(
      <ProtectedRoute loginPath="/signin">
        <div>secret content</div>
      </ProtectedRoute>,
    )
    await Promise.resolve()
    const calledWith = replaceMock.mock.calls[0]?.[0] as string
    expect(calledWith).toMatch(/^\/signin/)
  })

  it("redirects already-authenticated users away from auth pages", async () => {
    useAuthStore.setState({
      hydrated: true,
      accessToken: "jwt-1",
      refreshToken: "rt-1",
      user: { id: "u", email: "a@b.c", role: "owner", tenantId: "t" },
      tenant: { id: "t", slug: "acme", name: "Acme" },
      expiresAt: Date.now() + 60_000,
    })
    render(
      <ProtectedRoute redirectIfAuthenticatedTo="/app">
        <div>login form</div>
      </ProtectedRoute>,
    )
    await Promise.resolve()
    expect(replaceMock).toHaveBeenCalledWith("/app")
  })
})
