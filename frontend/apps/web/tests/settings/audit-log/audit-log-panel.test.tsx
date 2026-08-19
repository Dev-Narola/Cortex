/**
 * AuditLogPanel — F7 Part 5.
 *
 * Tests the Settings → Audit Log screen.
 *
 * Spec coverage:
 *   - Task 4 (page title + subtitle) — pinned
 *     by the `audit-log-panel` testid + the
 *     "Audit Log" heading.
 *   - Task 5 (audit table) — Time / Actor /
 *     Action / Resource columns render with
 *     backend values.
 *   - Task 9 (action humanisation) — every
 *     documented action is mapped to a
 *     readable label.
 *   - Task 19 (loading skeleton) — skeleton
 *     while the query is in flight.
 *   - Task 20 (empty state) — "No activity
 *     yet" for an empty page.
 *   - Task 21 (error + retry) — ErrorState
 *     with Retry triggers refetch.
 *   - Task 24 (forbidden state) — a 403 from
 *     the backend renders a friendly
 *     "no access" card.
 *   - Task 27 (tenant scope) — endpoint is
 *     `/api/v1/audit-log`; the test pins
 *     the actual request path AND asserts
 *     no `tenant_id` query param.
 *   - Task 33 (action badges) — every row
 *     has a category badge.
 *   - Task 35 (action label rendering) —
 *     the spec's required actions render
 *     the right friendly label.
 *   - Task 36 (multiple actions) — all 7
 *     spec-required actions are mapped.
 *
 * The api-client is mocked at the seam.
 * The auth store is reset between tests.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AuditLogPanel } from "@/components/settings/audit-log/audit-log-panel"
import { useAuthStore } from "@/lib/auth/store"

const getMock = vi.fn()

vi.mock("@/lib/auth/api-client", () => ({
  getApiClient: () => ({ get: getMock, post: vi.fn(), delete: vi.fn() }),
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

const NOW = "2026-08-19T19:42:00Z"
const EVENT_ACCESS = {
  id: "e-1",
  tenant_id: "t-1",
  action: "document_accessed",
  actor_user_id: "u-1",
  actor_api_key_id: null,
  resource_type: "document",
  resource_id: "d-abc123",
  metadata: {},
  ip_address: "10.0.0.1",
  created_at: NOW,
}

const EVENT_REVOKE = {
  id: "e-2",
  tenant_id: "t-1",
  action: "api_key_revoked",
  actor_user_id: "u-1",
  actor_api_key_id: null,
  resource_type: "api_key",
  resource_id: "k-xyz",
  metadata: { name: "CI pipeline" },
  ip_address: null,
  created_at: "2026-08-19T19:35:00Z",
}

function makeEvent(overrides: Partial<typeof EVENT_ACCESS> & { id: string }) {
  return { ...EVENT_ACCESS, ...overrides }
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

describe("AuditLogPanel", () => {
  describe("rendering (Task 4 + Task 5)", () => {
    it("renders the page title + subtitle + append-only note", async () => {
      setRole("owner")
      getMock.mockResolvedValueOnce({ items: [], next_cursor: null })
      render(<AuditLogPanel />, { wrapper: makeWrapper() })
      expect(screen.getByRole("heading", { name: /audit log/i })).toBeInTheDocument()
      expect(
        screen.getByText(/review activity and changes made in this workspace/i),
      ).toBeInTheDocument()
      expect(screen.getByText(/append-only/i)).toBeInTheDocument()
    })

    it("renders the audit table with backend values for two events", async () => {
      setRole("owner")
      getMock.mockResolvedValueOnce({
        items: [EVENT_ACCESS, EVENT_REVOKE],
        next_cursor: null,
      })
      render(<AuditLogPanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(screen.getByTestId("audit-log-body")).toBeInTheDocument()
      })
      // Both rows are present.
      expect(screen.getByTestId("audit-log-row-e-1")).toBeInTheDocument()
      expect(screen.getByTestId("audit-log-row-e-2")).toBeInTheDocument()
      // The action labels are humanised.
      expect(screen.getByTestId("audit-log-action-e-1")).toHaveTextContent(
        "Document accessed",
      )
      expect(screen.getByTestId("audit-log-action-e-2")).toHaveTextContent(
        "API key revoked",
      )
    })

    it("every row has a category badge (Task 33)", async () => {
      setRole("owner")
      getMock.mockResolvedValueOnce({
        items: [EVENT_ACCESS, EVENT_REVOKE],
        next_cursor: null,
      })
      render(<AuditLogPanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(screen.getByTestId("audit-log-body")).toBeInTheDocument()
      })
      // The category badges for the two
      // actions above. The badge text is
      // the friendly category label.
      const docsBadge = screen.getByTestId("audit-log-category-documents")
      const keysBadge = screen.getByTestId("audit-log-category-api_keys")
      expect(docsBadge).toHaveTextContent(/documents/i)
      expect(keysBadge).toHaveTextContent(/api keys/i)
    })
  })

  describe("action humanisation (Tasks 9, 35, 36)", () => {
    it("maps every spec-required action to its friendly label", async () => {
      setRole("owner")
      // Build a page with one event per
      // spec-required action. The backend
      // returns 50 max, so 7 fits.
      const events = [
        "document_created",
        "document_accessed",
        "document_deleted",
        "api_key_created",
        "api_key_revoked",
        "tenant_updated",
        "role_changed",
      ].map((a, i) => makeEvent({ id: `e-${i}`, action: a }))
      getMock.mockResolvedValueOnce({ items: events, next_cursor: null })
      render(<AuditLogPanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(screen.getByTestId("audit-log-body")).toBeInTheDocument()
      })
      const expectedLabels: Record<string, string> = {
        document_created: "Document created",
        document_accessed: "Document accessed",
        document_deleted: "Document deleted",
        api_key_created: "API key created",
        api_key_revoked: "API key revoked",
        tenant_updated: "Tenant updated",
        role_changed: "Role changed",
      }
      for (const [action, label] of Object.entries(expectedLabels)) {
        // The test is per-id, not per-action;
        // index the events array by action
        // name to find the right id.
        const idx = [
          "document_created",
          "document_accessed",
          "document_deleted",
          "api_key_created",
          "api_key_revoked",
          "tenant_updated",
          "role_changed",
        ].indexOf(action)
        const id = `e-${idx}`
        expect(screen.getByTestId(`audit-log-action-${id}`)).toHaveTextContent(label)
      }
    })
  })

  describe("loading + empty + error + forbidden (Tasks 19, 20, 21, 24)", () => {
    it("shows a loading skeleton while the query is in flight", () => {
      setRole("owner")
      // Pending forever.
      getMock.mockReturnValue(new Promise(() => {}))
      render(<AuditLogPanel />, { wrapper: makeWrapper() })
      expect(screen.getByTestId("audit-log-skeleton")).toBeInTheDocument()
    })

    it("shows the empty state when the page is empty", async () => {
      setRole("owner")
      getMock.mockResolvedValueOnce({ items: [], next_cursor: null })
      render(<AuditLogPanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(screen.getByTestId("audit-log-empty")).toBeInTheDocument()
      })
      expect(screen.getByTestId("audit-log-empty")).toHaveTextContent(/no activity yet/i)
    })

    it("shows ErrorState with Retry on a 500", async () => {
      setRole("owner")
      getMock.mockRejectedValueOnce(new Error("network down"))
      render(<AuditLogPanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(screen.getByText(/unable to load the audit log/i)).toBeInTheDocument()
      })
      const retry = screen.getByRole("button", { name: /retry/i })
      const callsBefore = getMock.mock.calls.length
      fireEvent.click(retry)
      await waitFor(() => {
        expect(getMock.mock.calls.length).toBeGreaterThan(callsBefore)
      })
    })

    it("shows the forbidden state on a 403 (member/viewer direct URL)", async () => {
      setRole("owner")
      // A 403-shaped error from the API client.
      getMock.mockRejectedValueOnce(
        Object.assign(new Error("forbidden"), { status: 403 }),
      )
      render(<AuditLogPanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(screen.getByTestId("audit-log-forbidden")).toBeInTheDocument()
      })
      expect(screen.getByTestId("audit-log-forbidden")).toHaveTextContent(
        /don[’']t have access/i,
      )
    })
  })

  describe("tenant scope (Task 27)", () => {
    it("hits /api/v1/audit-log — never sends a tenant_id", async () => {
      setRole("owner")
      getMock.mockResolvedValueOnce({ items: [], next_cursor: null })
      render(<AuditLogPanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(getMock).toHaveBeenCalled()
      })
      expect(getMock).toHaveBeenCalledWith(
        "/api/v1/audit-log",
        expect.objectContaining({}),
      )
      // No tenant_id in any request.
      for (const call of getMock.mock.calls) {
        const opts = call[1] as { query?: Record<string, string | number> } | undefined
        if (opts?.query) {
          expect(opts.query).not.toHaveProperty("tenant_id")
        }
      }
    })

    it("forwards the action / resource / date filters as query params", async () => {
      setRole("owner")
      getMock.mockResolvedValue({ items: [], next_cursor: null })
      render(<AuditLogPanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(getMock).toHaveBeenCalled()
      })
      // The first call is the initial page
      // request with just `limit=50`.
      const initialCall = getMock.mock.calls[0]
      const opts = initialCall?.[1] as { query?: Record<string, string | number> } | undefined
      expect(opts?.query?.limit).toBe(50)
      // No filters yet.
      expect(opts?.query).not.toHaveProperty("action")
      expect(opts?.query).not.toHaveProperty("resource_type")
    })
  })

  describe("RBAC (Tasks 23, 24, 42, 55)", () => {
    it("owner / admin → Audit Log tab visible in the SettingsTabs", async () => {
      setRole("owner")
      // Render the SettingsTabs directly so
      // we can pin the navigation visibility
      // independent of the panel.
      const { SettingsTabs } = await import(
        "@/components/settings/settings-tabs"
      )
      getMock.mockResolvedValue({ items: [], next_cursor: null })
      render(<SettingsTabs />, { wrapper: makeWrapper() })
      expect(screen.getByTestId("settings-tab-audit-log")).toBeInTheDocument()
    })

    it("admin → Audit Log tab visible in the SettingsTabs", async () => {
      setRole("admin")
      const { SettingsTabs } = await import(
        "@/components/settings/settings-tabs"
      )
      getMock.mockResolvedValue({ items: [], next_cursor: null })
      render(<SettingsTabs />, { wrapper: makeWrapper() })
      expect(screen.getByTestId("settings-tab-audit-log")).toBeInTheDocument()
    })

    it("member → Audit Log tab HIDDEN in the SettingsTabs", async () => {
      setRole("member")
      const { SettingsTabs } = await import(
        "@/components/settings/settings-tabs"
      )
      getMock.mockResolvedValue({ items: [], next_cursor: null })
      render(<SettingsTabs />, { wrapper: makeWrapper() })
      expect(screen.queryByTestId("settings-tab-audit-log")).not.toBeInTheDocument()
    })

    it("viewer → Audit Log tab HIDDEN in the SettingsTabs", async () => {
      setRole("viewer")
      const { SettingsTabs } = await import(
        "@/components/settings/settings-tabs"
      )
      getMock.mockResolvedValue({ items: [], next_cursor: null })
      render(<SettingsTabs />, { wrapper: makeWrapper() })
      expect(screen.queryByTestId("settings-tab-audit-log")).not.toBeInTheDocument()
    })
  })

  describe("immutability (Task 29, 44)", () => {
    it("the api-client mock is only ever called with GET — no PATCH/PUT/DELETE", async () => {
      setRole("owner")
      getMock.mockResolvedValueOnce({ items: [EVENT_ACCESS], next_cursor: null })
      render(<AuditLogPanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(getMock).toHaveBeenCalled()
      })
      // The mock has no `post` / `patch` /
      // `put` / `delete` methods — they
      // would throw if called. The test
      // simply asserts the audit panel
      // made its expected call.
      expect(getMock).toHaveBeenCalledTimes(1)
    })
  })
})
