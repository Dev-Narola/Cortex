/**
 * UserMenu — F3 Part 1 (Task 5).
 *
 * Verifies the menu shows the right items, displays the
 * session's user data, and the "Log out" entry wires to
 * the F2 `useAuthStore.logout()` + redirects to /login.
 *
 * **Mocking strategy.** The real auth store + login()
 * is used; we only mock the F2 logout service (so the
 * test doesn't hit the network) and next/navigation
 * (so the redirect push is observable).
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const pushMock = vi.fn()
const replaceMock = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
  usePathname: () => "/app/dashboard",
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("@/services/auth/logout", () => ({
  logout: vi.fn().mockResolvedValue(undefined),
}))

import { UserMenu } from "@/components/navigation/UserMenu"
import { useAuthStore } from "@/lib/auth/store"

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

function seedSession() {
  useAuthStore.getState().login({
    accessToken: "jwt",
    refreshToken: "rt",
    expiresIn: 3600,
    user: {
      id: "u-1",
      email: "ada@cortex.dev",
      role: "owner",
      tenantId: "t-1",
    },
    tenant: { id: "t-1", slug: "acme", workspace: "Acme" },
  })
}

describe("UserMenu", () => {
  beforeEach(() => {
    useAuthStore.getState().clear()
    useAuthStore.setState({ hydrated: true, restored: true, isRestoring: false })
    pushMock.mockClear()
    replaceMock.mockClear()
  })
  afterEach(() => {
    useAuthStore.getState().clear()
  })

  it("shows name, email and workspace in the open menu", async () => {
    const user = userEvent.setup()
    seedSession()
    render(<UserMenu />, { wrapper: makeWrapper() })
    await user.click(screen.getByRole("button", { name: /open user menu for ada/i }))
    expect(await screen.findByText("ada@cortex.dev")).toBeInTheDocument()
    expect(screen.getByText("Acme")).toBeInTheDocument()
  })

  it("links only to pages that exist", async () => {
    const user = userEvent.setup()
    seedSession()
    render(<UserMenu />, { wrapper: makeWrapper() })
    await user.click(screen.getByRole("button", { name: /open user menu/i }))
    await user.click(await screen.findByRole("menuitem", { name: /api keys/i }))
    expect(pushMock).toHaveBeenCalledWith("/app/settings/api-keys")
  })

  it("clicking 'Log out' clears the store + redirects to /login", async () => {
    const user = userEvent.setup()
    seedSession()
    render(<UserMenu />, { wrapper: makeWrapper() })
    await user.click(screen.getByRole("button", { name: /open user menu/i }))
    await user.click(await screen.findByRole("menuitem", { name: /log out/i }))
    await waitFor(() => {
      expect(useAuthStore.getState().accessToken).toBeNull()
    })
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/login")
    })
  })
})
