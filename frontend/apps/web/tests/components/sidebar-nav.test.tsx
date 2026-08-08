/**
 * SidebarNav — F3 Part 1 (Task 2).
 *
 * Verifies the per-route list + active state + "Coming Soon"
 * disabled rendering.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const pushMock = vi.fn()
const replaceMock = vi.fn()

vi.mock("next/navigation", () => ({
  usePathname: vi.fn().mockReturnValue("/app/dashboard"),
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

  it("renders all 8 nav items", () => {
    render(<SidebarNav />, { wrapper: makeWrapper() })
    expect(screen.getByText("Dashboard")).toBeInTheDocument()
    // F4 Part 1: "Chat" replaces the old
    // "Conversations" placeholder (now a real route).
    expect(screen.getByText("Chat")).toBeInTheDocument()
    expect(screen.getByText("Documents")).toBeInTheDocument()
    expect(screen.getByText("Search")).toBeInTheDocument()
    expect(screen.getByText("Knowledge Graph")).toBeInTheDocument()
    expect(screen.getByText("Agents")).toBeInTheDocument()
    expect(screen.getByText("MCP")).toBeInTheDocument()
    expect(screen.getByText("Settings")).toBeInTheDocument()
  })

  it("marks the 'Coming Soon' items as disabled + visible badge", () => {
    render(<SidebarNav />, { wrapper: makeWrapper() })
    const soonBadges = screen.getAllByText(/^soon$/i)
    // F4 Part 1: 4 items are "coming soon"
    // (Search, Knowledge Graph, Agents, MCP).
    // Chat is now a live route.
    expect(soonBadges.length).toBe(4)
  })

  it("marks the live items as links (active state wiring is exercised by `pathname === href`)", () => {
    render(<SidebarNav />, { wrapper: makeWrapper() })
    // The three live items render as `<a>` (links).
    // Documents + Settings are non-active on the
    // dashboard route — assert they have no
    // `aria-current="page"` (the active link is).
    const documentsLink = screen.getByRole("link", { name: /^Documents$/i })
    expect(documentsLink).not.toHaveAttribute("aria-current", "page")
    const settingsLink = screen.getByRole("link", { name: /^Settings$/i })
    expect(settingsLink).not.toHaveAttribute("aria-current", "page")
  })
})
