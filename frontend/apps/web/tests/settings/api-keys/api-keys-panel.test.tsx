/**
 * ApiKeysPanel — F7 Part 2.
 *
 * Tests the panel's surface contract:
 *   - Loading skeleton while the list query is
 *     in flight.
 *   - Error state with Retry when the list
 *     query fails.
 *   - Empty state when the list is `[]`.
 *   - Key list with the right columns when the
 *     list is non-empty.
 *   - RBAC: Generate button visible for
 *     owner / admin, hidden for member / viewer;
 *     Revoke button visible for owner / admin,
 *     hidden for member / viewer AND for revoked
 *     keys.
 *   - Status badge: Active (success) vs Revoked
 *     (secondary) based on `revoked_at`.
 *   - One-time reveal: when a generate succeeds,
 *     the reveal opens with the raw key, then
 *     closes on Done (raw key gone).
 *   - Revoke: the confirm dialog appears, the
 *     mutation fires, and the row is gone after
 *     success.
 *
 * The api-client is mocked at the seam (Task 42).
 * The auth store is reset between tests so the
 * role gate is predictable.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiKeysPanel } from "@/components/settings/api-keys/api-keys-panel"
import { useAuthStore } from "@/lib/auth/store"

const getMock = vi.fn()
const postMock = vi.fn()
const deleteMock = vi.fn()

vi.mock("@/lib/auth/api-client", () => ({
  getApiClient: () => ({
    get: getMock,
    post: postMock,
    delete: deleteMock,
  }),
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
  postMock.mockReset()
  deleteMock.mockReset()
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

describe("ApiKeysPanel", () => {
  describe("permission gate (Task 33 — derived from actual backend `require_admin`)", () => {
    it("owner → Generate button visible", async () => {
      setRole("owner")
      getMock.mockResolvedValueOnce([])
      render(<ApiKeysPanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(screen.getByTestId("api-keys-generate-button")).toBeInTheDocument()
      })
    })

    it("admin → Generate button visible", async () => {
      setRole("admin")
      getMock.mockResolvedValueOnce([])
      render(<ApiKeysPanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(screen.getByTestId("api-keys-generate-button")).toBeInTheDocument()
      })
    })

    it("member → Generate button hidden, but list still renders", async () => {
      setRole("member")
      getMock.mockResolvedValueOnce([])
      render(<ApiKeysPanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(screen.getByTestId("api-keys-panel-empty")).toBeInTheDocument()
      })
      expect(screen.queryByTestId("api-keys-generate-button")).not.toBeInTheDocument()
    })

    it("viewer → Generate button hidden, but list still renders", async () => {
      setRole("viewer")
      getMock.mockResolvedValueOnce([])
      render(<ApiKeysPanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(screen.getByTestId("api-keys-panel-empty")).toBeInTheDocument()
      })
      expect(screen.queryByTestId("api-keys-generate-button")).not.toBeInTheDocument()
    })
  })

  describe("data states (Tasks 29-30, 38-41)", () => {
    it("renders a skeleton while the query is in flight", () => {
      setRole("owner")
      getMock.mockReturnValueOnce(new Promise(() => {}))
      render(<ApiKeysPanel />, { wrapper: makeWrapper() })
      expect(screen.getByTestId("api-keys-panel-skeleton")).toBeInTheDocument()
    })

    it("renders the error state with a Retry when the query fails", async () => {
      setRole("owner")
      getMock.mockRejectedValueOnce(new Error("Network down"))
      render(<ApiKeysPanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(screen.getByText(/Unable to load API keys/i)).toBeInTheDocument()
      })
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()
    })

    it("renders the empty state with the action button when the list is empty", async () => {
      setRole("owner")
      getMock.mockResolvedValueOnce([])
      render(<ApiKeysPanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(screen.getByTestId("api-keys-panel-empty")).toBeInTheDocument()
      })
      // Owner + empty → the empty state shows
      // its own "Generate New Key" affordance
      // (in addition to the top-right header
      // button). We assert at least one is
      // present.
      expect(
        screen.getAllByRole("button", { name: /generate new key/i }).length,
      ).toBeGreaterThanOrEqual(1)
    })

    it("renders the table with rows when the list is non-empty (Task 38)", async () => {
      setRole("owner")
      getMock.mockResolvedValueOnce([
        {
          id: "k-1",
          tenant_id: "t-1",
          name: "CI Pipeline",
          scopes: ["documents:read"],
          last_used_at: "2026-08-18T10:00:00Z",
          revoked_at: null,
          created_at: "2026-08-15T09:00:00Z",
        },
        {
          id: "k-2",
          tenant_id: "t-1",
          name: "Research Bot",
          scopes: [],
          last_used_at: null,
          revoked_at: "2026-08-17T12:00:00Z",
          created_at: "2026-08-12T08:00:00Z",
        },
      ])
      render(<ApiKeysPanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(screen.getByTestId("api-keys-table")).toBeInTheDocument()
      })
      expect(screen.getByTestId("api-key-row-k-1")).toBeInTheDocument()
      expect(screen.getByTestId("api-key-row-k-2")).toBeInTheDocument()
      // Status badges
      expect(screen.getByTestId("api-key-status-k-1")).toHaveTextContent(/active/i)
      expect(screen.getByTestId("api-key-status-k-2")).toHaveTextContent(/revoked/i)
      // The masked key uses JetBrains Mono.
      const masked = screen.getByTestId("api-key-masked-k-1")
      expect(masked.tagName).toBe("CODE")
      expect(masked.className).toContain("font-mono")
    })

    it("calls GET /api-keys with the expected query (Task 42 — endpoint pinning)", async () => {
      setRole("owner")
      getMock.mockResolvedValueOnce([])
      render(<ApiKeysPanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(getMock).toHaveBeenCalledWith(
          "/api/v1/api-keys",
          expect.objectContaining({ query: { include_revoked: false } }),
        )
      })
    })
  })

  describe("status / revoke visibility (Tasks 26-27)", () => {
    it("revoked keys do NOT show a Revoke action", async () => {
      setRole("owner")
      getMock.mockResolvedValueOnce([
        {
          id: "k-revoked",
          tenant_id: "t-1",
          name: "Old Key",
          scopes: [],
          last_used_at: null,
          revoked_at: "2026-08-10T00:00:00Z",
          created_at: "2026-08-01T00:00:00Z",
        },
      ])
      render(<ApiKeysPanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(screen.getByTestId("api-key-row-k-revoked")).toBeInTheDocument()
      })
      expect(screen.queryByTestId("api-key-revoke-k-revoked")).not.toBeInTheDocument()
    })

    it("active keys show a Revoke action for admin users", async () => {
      setRole("admin")
      getMock.mockResolvedValueOnce([
        {
          id: "k-active",
          tenant_id: "t-1",
          name: "Live Key",
          scopes: [],
          last_used_at: null,
          revoked_at: null,
          created_at: "2026-08-19T00:00:00Z",
        },
      ])
      render(<ApiKeysPanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(screen.getByTestId("api-key-revoke-k-active")).toBeInTheDocument()
      })
    })

    it("active keys do NOT show a Revoke action for member users", async () => {
      setRole("member")
      getMock.mockResolvedValueOnce([
        {
          id: "k-active",
          tenant_id: "t-1",
          name: "Live Key",
          scopes: [],
          last_used_at: null,
          revoked_at: null,
          created_at: "2026-08-19T00:00:00Z",
        },
      ])
      render(<ApiKeysPanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(screen.getByTestId("api-key-row-k-active")).toBeInTheDocument()
      })
      expect(screen.queryByTestId("api-key-revoke-k-active")).not.toBeInTheDocument()
    })
  })

  describe("one-time key lifecycle (Task 43)", () => {
    it("open the generate modal → submit → reveal shows the raw key → Done clears it", async () => {
      const user = userEvent.setup()
      setRole("owner")
      getMock.mockResolvedValueOnce([])
      postMock.mockResolvedValueOnce({
        id: "k-new",
        tenant_id: "t-1",
        name: "My Key",
        scopes: [],
        last_used_at: null,
        revoked_at: null,
        created_at: "2026-08-19T00:00:00Z",
        raw_key: "cx_live_abc123_TESTONLY",
      })
      render(<ApiKeysPanel />, { wrapper: makeWrapper() })
      // Open the generate modal.
      const generateBtn = await screen.findByTestId("api-keys-generate-button")
      fireEvent.click(generateBtn)
      // Fill in + submit.
      const input = await screen.findByTestId("api-key-name-input")
      await user.type(input, "My Key")
      fireEvent.click(screen.getByTestId("api-key-submit"))
      // The reveal opens with the raw key.
      await waitFor(() => {
        expect(screen.getByTestId("api-key-reveal-modal")).toBeInTheDocument()
      })
      const revealValue = screen.getByTestId("api-key-reveal-value")
      expect(revealValue).toHaveTextContent("cx_live_abc123_TESTONLY")
      // Done closes the reveal (raw key gone from view).
      fireEvent.click(screen.getByTestId("api-key-reveal-done"))
      await waitFor(() => {
        expect(screen.queryByTestId("api-key-reveal-modal")).not.toBeInTheDocument()
      })
    })
  })

  describe("revoke flow (Task 45)", () => {
    it("open confirm → cancel → no mutation fires", async () => {
      const user = userEvent.setup()
      setRole("owner")
      getMock.mockResolvedValueOnce([
        {
          id: "k-1",
          tenant_id: "t-1",
          name: "My Key",
          scopes: [],
          last_used_at: null,
          revoked_at: null,
          created_at: "2026-08-19T00:00:00Z",
        },
      ])
      render(<ApiKeysPanel />, { wrapper: makeWrapper() })
      const revokeBtn = await screen.findByTestId("api-key-revoke-k-1")
      fireEvent.click(revokeBtn)
      const confirm = await screen.findByTestId("revoke-api-key-confirm")
      expect(confirm).toBeInTheDocument()
      await user.click(screen.getByTestId("revoke-api-key-cancel"))
      expect(deleteMock).not.toHaveBeenCalled()
    })

    it("open confirm → confirm → DELETE /api-keys/{id} fires", async () => {
      const user = userEvent.setup()
      setRole("owner")
      getMock.mockResolvedValueOnce([
        {
          id: "k-1",
          tenant_id: "t-1",
          name: "My Key",
          scopes: [],
          last_used_at: null,
          revoked_at: null,
          created_at: "2026-08-19T00:00:00Z",
        },
      ])
      // The mutation's onSuccess invalidates the
      // list; we return the empty list to model
      // "key is now revoked (and filtered out)".
      getMock.mockResolvedValueOnce([])
      deleteMock.mockResolvedValueOnce({
        id: "k-1",
        tenant_id: "t-1",
        name: "My Key",
        scopes: [],
        last_used_at: null,
        revoked_at: "2026-08-19T00:00:00Z",
        created_at: "2026-08-19T00:00:00Z",
      })
      render(<ApiKeysPanel />, { wrapper: makeWrapper() })
      const revokeBtn = await screen.findByTestId("api-key-revoke-k-1")
      fireEvent.click(revokeBtn)
      const confirmBtn = await screen.findByTestId("revoke-api-key-confirm-button")
      await user.click(confirmBtn)
      await waitFor(() => {
        expect(deleteMock).toHaveBeenCalledWith("/api/v1/api-keys/k-1", expect.objectContaining({}))
      })
    })
  })
})
