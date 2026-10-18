/**
 * SidebarNav — F3 Part 1 (Task 2).
 *
 * Verifies the grouped nav, role gating of admin-only items, and the
 * active state.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const pushMock = vi.fn()
const replaceMock = vi.fn()

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/dashboard",
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
  useSearchParams: () => new URLSearchParams(),
}))

import { SidebarNav } from "@/components/navigation/SidebarNav"
import { useAuthStore } from "@/lib/auth/store"

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

describe("SidebarNav", () => {
  beforeEach(() => {
    useAuthStore.getState().clear()
  })
  afterEach(() => {
    useAuthStore.getState().clear()
  })

  function setRole(role: "owner" | "admin" | "member" | "viewer") {
    useAuthStore.setState({ user: { id: "u1", email: "a@b.co", role, tenantId: "t1" } })
  }

  it("renders the three groups with every live route for admins", () => {
    setRole("admin")
    render(<SidebarNav />, { wrapper: makeWrapper() })
    for (const g of ["Workspace", "Management", "System"]) {
      expect(screen.getByText(g)).toBeInTheDocument()
    }
    for (const name of [
      "Dashboard",
      "Chat",
      "Documents",
      "Search",
      "Knowledge Graph",
      "Agents",
      "Team",
      "API keys",
      "MCP",
      "Usage",
      "Audit log",
    ]) {
      expect(screen.getByRole("link", { name: new RegExp(`^${name}$`) })).toBeInTheDocument()
    }
    expect(screen.queryByText(/^soon$/i)).not.toBeInTheDocument()
  })

  it("hides owner/admin-only items from members", () => {
    setRole("member")
    render(<SidebarNav />, { wrapper: makeWrapper() })
    expect(screen.queryByRole("link", { name: /^Team$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /^Audit log$/ })).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: /^Usage$/ })).toBeInTheDocument()
  })

  it("marks only the current route as the active page", () => {
    setRole("member")
    render(<SidebarNav />, { wrapper: makeWrapper() })
    expect(screen.getByRole("link", { name: /^Dashboard$/ })).toHaveAttribute(
      "aria-current",
      "page",
    )
    expect(screen.getByRole("link", { name: /^Documents$/ })).not.toHaveAttribute(
      "aria-current",
      "page",
    )
  })
})
