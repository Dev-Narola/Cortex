/**
 * TeamPanel — F7 Part 1.
 *
 * Tests the panel's surface contract:
 *   - Loading skeleton while the list query is in flight.
 *   - Error state with Retry when the list query fails.
 *   - Empty state when the roster is `[]`.
 *   - Member table when the roster is non-empty.
 *   - Permission-aware Invite button: hidden for
 *     member / viewer, visible for owner / admin.
 *
 * The api-client is mocked at the seam (Task 42 — "Mock
 * the API client, not the component"). The auth store
 * is reset between tests so the role gate is predictable.
 */

import { ApiError } from "@cortex/api-client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TeamPanel } from "@/components/settings/team/team-panel"
import { useAuthStore } from "@/lib/auth/store"

const getMock = vi.fn()

vi.mock("@/lib/auth/api-client", () => ({
  getApiClient: () => ({ get: getMock, post: vi.fn() }),
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

function setRole(role: "owner" | "admin" | "member" | "viewer") {
  useAuthStore.setState({
    user: { id: "u-1", email: "ada@cortex.dev", role, tenantId: "t-1" },
    tenant: { id: "t-1", slug: "acme" },
    accessToken: "jwt",
    refreshToken: "rt",
    isOnboarded: true,
    expiresAt: Date.now() + 60_000,
    hydrated: true,
    restored: true,
  })
}

beforeEach(() => {
  getMock.mockReset()
  useAuthStore.setState({
    accessToken: null,
    refreshToken: null,
    user: null,
    tenant: null,
    isOnboarded: false,
    expiresAt: null,
    hydrated: false,
    restored: false,
    isRestoring: false,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("TeamPanel", () => {
  describe("permission gate (F7-Part 1 Task 32)", () => {
    it("owner → Invite button visible", async () => {
      setRole("owner")
      getMock.mockResolvedValueOnce({ items: [], total: 0, limit: 50, offset: 0 })
      render(<TeamPanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(screen.getByTestId("team-invite-button")).toBeInTheDocument()
      })
    })

    it("admin → Invite button visible", async () => {
      setRole("admin")
      getMock.mockResolvedValueOnce({ items: [], total: 0, limit: 50, offset: 0 })
      render(<TeamPanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(screen.getByTestId("team-invite-button")).toBeInTheDocument()
      })
    })

    it("member → Invite button hidden", async () => {
      setRole("member")
      getMock.mockResolvedValueOnce({ items: [], total: 0, limit: 50, offset: 0 })
      render(<TeamPanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(screen.getByTestId("team-panel-empty")).toBeInTheDocument()
      })
      expect(screen.queryByTestId("team-invite-button")).not.toBeInTheDocument()
    })

    it("viewer → Invite button hidden", async () => {
      setRole("viewer")
      getMock.mockResolvedValueOnce({ items: [], total: 0, limit: 50, offset: 0 })
      render(<TeamPanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(screen.getByTestId("team-panel-empty")).toBeInTheDocument()
      })
      expect(screen.queryByTestId("team-invite-button")).not.toBeInTheDocument()
    })
  })

  describe("data states (Tasks 33-34)", () => {
    it("renders a skeleton while the query is in flight", () => {
      setRole("owner")
      getMock.mockReturnValueOnce(new Promise(() => {}))
      render(<TeamPanel />, { wrapper: makeWrapper() })
      expect(screen.getByTestId("team-panel-skeleton")).toBeInTheDocument()
    })

    it("renders the error state with a Retry when the query fails", async () => {
      setRole("owner")
      getMock.mockRejectedValueOnce(new ApiError(404, { message: "Not implemented" }))
      render(<TeamPanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(screen.getByText(/Unable to load your team/i)).toBeInTheDocument()
      })
      // The error state exposes a Retry button.
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()
    })

    it("renders the empty state with the action button when the roster is empty", async () => {
      setRole("owner")
      getMock.mockResolvedValueOnce({ items: [], total: 0, limit: 50, offset: 0 })
      render(<TeamPanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(screen.getByTestId("team-panel-empty")).toBeInTheDocument()
      })
      // Owner + empty → the empty state shows its
      // own "Invite your team" affordance.
      expect(screen.getByRole("button", { name: /invite your team/i })).toBeInTheDocument()
    })

    it("renders the member table when the roster is non-empty (Tasks 38-39)", async () => {
      setRole("owner")
      getMock.mockResolvedValueOnce({
        items: [
          {
            id: "u-1",
            email: "ada@cortex.dev",
            full_name: "Ada Lovelace",
            role: "owner",
            created_at: "2026-01-01T00:00:00Z",
          },
          {
            id: "u-2",
            email: "bob@cortex.dev",
            full_name: null,
            role: "member",
            created_at: "2026-02-15T00:00:00Z",
          },
        ],
        total: 2,
        limit: 50,
        offset: 0,
      })
      render(<TeamPanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(screen.getByTestId("team-member-table")).toBeInTheDocument()
      })
      expect(screen.getByTestId("team-row-u-1")).toBeInTheDocument()
      expect(screen.getByTestId("team-row-u-2")).toBeInTheDocument()
      // Role badges render the friendly form.
      const ownerBadge = screen.getByTestId("team-role-u-1")
      expect(ownerBadge).toHaveTextContent(/owner/i)
      const memberBadge = screen.getByTestId("team-role-u-2")
      expect(memberBadge).toHaveTextContent(/member/i)
    })

    it("calls the api-client with the expected URL (Task 42 — endpoint pinning)", async () => {
      setRole("owner")
      getMock.mockResolvedValueOnce({ items: [], total: 0, limit: 50, offset: 0 })
      render(<TeamPanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(getMock).toHaveBeenCalledWith("/api/v1/users", expect.objectContaining({}))
      })
    })
  })
})
