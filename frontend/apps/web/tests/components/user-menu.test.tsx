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
  usePathname: vi.fn().mockReturnValue("/app/dashboard"),
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

  it("renders the user's email when present", async () => {
    const user = userEvent.setup()
    seedSession()
    render(<UserMenu />, { wrapper: makeWrapper() })
    // The email shows up in both the trigger label
    // (next to the avatar) and the dropdown header.
    // Assert at least one match (the email is in the DOM
    // before the dropdown opens).
    expect(screen.getAllByText("ada@cortex.dev").length).toBeGreaterThanOrEqual(1)
    // Open the dropdown with a real pointer-down/pointer-up
    // cycle (Radix needs the pointer events, not just click).
    await user.click(screen.getByRole("button", { name: /open user menu/i }))
    // The dropdown surfaces the email inside the
    // `DropdownMenuLabel`. With the dropdown open, the
    // email is now in at least 2 places.
    await waitFor(() => {
      expect(screen.getAllByText("ada@cortex.dev").length).toBeGreaterThanOrEqual(2)
    })
  })

  it("the menu exposes Profile / Workspace / Settings / Log out", async () => {
    const user = userEvent.setup()
    seedSession()
    render(<UserMenu />, { wrapper: makeWrapper() })
    await user.click(screen.getByRole("button", { name: /open user menu/i }))
    expect(await screen.findByText("Profile")).toBeInTheDocument()
    expect(await screen.findByText("Workspace")).toBeInTheDocument()
    expect(await screen.findByText("Settings")).toBeInTheDocument()
    // Log out is rendered both in the items list and
    // the footer.
    const logOuts = screen.getAllByText(/log out/i)
    expect(logOuts.length).toBeGreaterThanOrEqual(1)
  })

  it("clicking 'Log out' clears the store + redirects to /login", async () => {
    const user = userEvent.setup()
    seedSession()
    render(<UserMenu />, { wrapper: makeWrapper() })
    await user.click(screen.getByRole("button", { name: /open user menu/i }))
    // The first "Log out" entry is the items list
    // version. (The footer also has a "Log out" inside
    // a nested user menu; both end up clearing the
    // store + pushing /login.)
    const logOuts = await screen.findAllByRole("button", { name: /log out/i })
    await user.click(logOuts[0]!)
    await waitFor(() => {
      expect(useAuthStore.getState().accessToken).toBeNull()
    })
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/login")
    })
  })
})
