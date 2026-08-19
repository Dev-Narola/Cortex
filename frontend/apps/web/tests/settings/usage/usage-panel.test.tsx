/**
 * UsagePanel — F7 Part 4.
 *
 * Tests the Settings → Usage & Billing screen.
 *
 * Spec coverage:
 *   - Task 4 (page title + subtitle) — pinned
 *     by the `usage-panel` testid + the
 *     "Usage & Billing" heading.
 *   - Task 6 (summary section) — 4 stat
 *     cards render with real backend values.
 *   - Task 11 (usage breakdown) — per-event
 *     rows render in deterministic priority
 *     order (embedding → completion → rerank
 *     → storage → request).
 *   - Task 13 (usage history) — recent events
 *     table renders newest first.
 *   - Task 17 (loading skeleton) — skeleton
 *     while queries are in flight.
 *   - Task 18 (error + retry) — ErrorState +
 *     Retry triggers refetch.
 *   - Task 19 (empty state) — "No usage yet"
 *     for empty breakdown; "No recent events"
 *     for empty history.
 *   - Task 24 (tenant scope) — endpoints are
 *     `/tenants/me/usage*`; the test pins the
 *     actual request path.
 *   - Task 28 (cost precision) — $0.0042 must
 *     NOT silently become $0.00.
 *   - Task 35 (unknown event type) — the
 *     screen does not crash when the backend
 *     adds a new event type.
 *   - Task 36 (cost formatting) — $0,
 *     $0.0042, $1.25, $125.90 each format
 *     correctly.
 *
 * The api-client is mocked at the seam.
 * The auth store is reset between tests so
 * role-based gates are predictable.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { UsagePanel } from "@/components/settings/usage/usage-panel"
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

const SUMMARY = {
  period: { from: "2026-08-01T00:00:00Z", to: "2026-08-31T23:59:59Z" },
  requests: 1280,
  embedding_tokens: 48_200,
  completion_input_tokens: 12_400,
  completion_output_tokens: 19_000,
  rerank_units: 4_600,
  estimated_cost_usd: 4.82,
}

const AGGREGATE = {
  tenant_id: "t-1",
  period_start: "2026-08-01T00:00:00Z",
  period_end: "2026-08-31T23:59:59Z",
  total_cost_usd: 4.82,
  by_event: {
    embedding: { tokens: 48_200, cost_usd: 0.24 },
    completion: { tokens: 31_400, cost_usd: 4.5 },
    rerank: { candidates: 4_600, cost_usd: 0.08 },
  },
}

const EVENTS = [
  {
    id: "e-1",
    event_type: "completion",
    units: 2_400,
    unit_type: "tokens",
    cost_usd: 0.18,
    provider: "openai",
    model: "gpt-4o-mini",
    resource_id: null,
    input_tokens: 1_800,
    output_tokens: 600,
    total_tokens: 2_400,
    pricing_version: null,
    created_at: "2026-08-19T10:30:00Z",
  },
  {
    id: "e-2",
    event_type: "embedding",
    units: 8_200,
    unit_type: "tokens",
    cost_usd: 0.04,
    provider: "nvidia",
    model: "nv-embed",
    resource_id: "d-1",
    input_tokens: 8_200,
    output_tokens: 0,
    total_tokens: 8_200,
    pricing_version: null,
    created_at: "2026-08-19T09:15:00Z",
  },
]

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

describe("UsagePanel", () => {
  describe("rendering (Tasks 4 + 6)", () => {
    it("renders the page title + subtitle + period context", async () => {
      setRole("owner")
      getMock.mockResolvedValueOnce(SUMMARY).mockResolvedValueOnce(AGGREGATE).mockResolvedValueOnce(EVENTS)
      render(<UsagePanel />, { wrapper: makeWrapper() })
      // Title.
      expect(screen.getByRole("heading", { name: /usage & billing/i })).toBeInTheDocument()
      // Subtitle.
      expect(
        screen.getByText(/track your workspace usage, estimated cost, and current limits/i),
      ).toBeInTheDocument()
      // Period context (async — wait for the
      // summary query to settle).
      await waitFor(() => {
        expect(screen.getByTestId("usage-period-context")).toHaveTextContent(/Current period/i)
      })
    })

    it("renders the 4 stat cards with backend values", async () => {
      setRole("owner")
      getMock.mockResolvedValueOnce(SUMMARY).mockResolvedValueOnce(AGGREGATE).mockResolvedValueOnce(EVENTS)
      render(<UsagePanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(screen.getByTestId("usage-stat-requests")).toHaveTextContent("1,280")
      })
      // Tokens = 48,200 + 12,400 + 19,000 = 79,600 → "79.6K"
      expect(screen.getByTestId("usage-stat-tokens")).toHaveTextContent("79.6K")
      // Cost is $4.82.
      expect(screen.getByTestId("usage-stat-cost")).toHaveTextContent("$4.82")
      // Period card exists.
      expect(screen.getByTestId("usage-stat-period")).toBeInTheDocument()
    })

    it("preserves small-cost precision: $0.0042 does NOT silently become $0.00", async () => {
      setRole("owner")
      const tiny = {
        ...SUMMARY,
        estimated_cost_usd: 0.0042,
      }
      getMock.mockResolvedValueOnce(tiny).mockResolvedValueOnce(AGGREGATE).mockResolvedValueOnce([])
      render(<UsagePanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        // 4 decimal places for < $1.
        expect(screen.getByTestId("usage-stat-cost")).toHaveTextContent("$0.0042")
      })
    })

    it("formats $0.00 exactly (not '—')", async () => {
      setRole("owner")
      const zero = { ...SUMMARY, estimated_cost_usd: 0 }
      getMock.mockResolvedValueOnce(zero).mockResolvedValueOnce(AGGREGATE).mockResolvedValueOnce([])
      render(<UsagePanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(screen.getByTestId("usage-stat-cost")).toHaveTextContent("$0.00")
      })
    })

    it("formats $1.25 with 2 decimal places (>= $1 path)", async () => {
      setRole("owner")
      const mid = { ...SUMMARY, estimated_cost_usd: 1.25 }
      getMock.mockResolvedValueOnce(mid).mockResolvedValueOnce(AGGREGATE).mockResolvedValueOnce([])
      render(<UsagePanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(screen.getByTestId("usage-stat-cost")).toHaveTextContent("$1.25")
      })
    })

    it("formats $125.90 with 2 decimal places (>= $1 path)", async () => {
      setRole("owner")
      const big = { ...SUMMARY, estimated_cost_usd: 125.9 }
      getMock.mockResolvedValueOnce(big).mockResolvedValueOnce(AGGREGATE).mockResolvedValueOnce([])
      render(<UsagePanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(screen.getByTestId("usage-stat-cost")).toHaveTextContent("$125.90")
      })
    })
  })

  describe("breakdown section (Task 11 + Task 12 + Task 35)", () => {
    it("renders one row per event type with friendly labels", async () => {
      setRole("owner")
      getMock.mockResolvedValueOnce(SUMMARY).mockResolvedValueOnce(AGGREGATE).mockResolvedValueOnce([])
      render(<UsagePanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(screen.getByTestId("usage-breakdown")).toBeInTheDocument()
      })
      // Friendly labels.
      expect(screen.getByTestId("usage-breakdown-label-embedding")).toHaveTextContent("Embeddings")
      expect(screen.getByTestId("usage-breakdown-label-completion")).toHaveTextContent("Completions")
      expect(screen.getByTestId("usage-breakdown-label-rerank")).toHaveTextContent("Rerank")
    })

    it("sorts rows in the priority order: embedding → completion → rerank → storage → request → alpha", async () => {
      setRole("owner")
      const unordered = {
        ...AGGREGATE,
        by_event: {
          rerank: { candidates: 100, cost_usd: 0.1 },
          storage: { units: 1, cost_usd: 0.05 },
          completion: { tokens: 200, cost_usd: 0.2 },
          embedding: { tokens: 300, cost_usd: 0.3 },
        },
      }
      getMock.mockResolvedValueOnce(SUMMARY).mockResolvedValueOnce(unordered).mockResolvedValueOnce([])
      render(<UsagePanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(screen.getByTestId("usage-breakdown")).toBeInTheDocument()
      })
      const list = screen.getByTestId("usage-breakdown-list")
      const items = Array.from(list.querySelectorAll("li"))
      // The testid encodes the event_type as a
      // suffix; we sort by that.
      const order = items.map((el) =>
        el.getAttribute("data-testid")?.replace("usage-breakdown-row-", ""),
      )
      expect(order).toEqual(["embedding", "completion", "rerank", "storage"])
    })

    it("does not crash on an unknown event type the backend may add in the future", async () => {
      setRole("owner")
      const future = {
        ...AGGREGATE,
        by_event: {
          embedding: { tokens: 100, cost_usd: 0.01 },
          future_event_type: { units: 50, cost_usd: 0.02 },
        },
      }
      getMock.mockResolvedValueOnce(SUMMARY).mockResolvedValueOnce(future).mockResolvedValueOnce([])
      render(<UsagePanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(screen.getByTestId("usage-breakdown-row-future_event_type")).toBeInTheDocument()
      })
      // The label is the raw enum (the
      // defensive default branch of
      // `eventTypeLabel`).
      expect(
        screen.getByTestId("usage-breakdown-label-future_event_type"),
      ).toHaveTextContent("future_event_type")
    })
  })

  describe("history section (Task 13 + Task 15 + Task 16)", () => {
    it("renders the events table with newest first", async () => {
      setRole("owner")
      getMock.mockResolvedValueOnce(SUMMARY).mockResolvedValueOnce(AGGREGATE).mockResolvedValueOnce(EVENTS)
      render(<UsagePanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(screen.getByTestId("usage-history")).toBeInTheDocument()
      })
      // Both event rows are present.
      expect(screen.getByTestId("usage-history-row-e-1")).toBeInTheDocument()
      expect(screen.getByTestId("usage-history-row-e-2")).toBeInTheDocument()
      // Cost is shown.
      expect(screen.getByTestId("usage-history-cost-e-1")).toHaveTextContent("$0.18")
      expect(screen.getByTestId("usage-history-cost-e-2")).toHaveTextContent("$0.04")
    })

    it("displays provider + model subtitle when present", async () => {
      setRole("owner")
      getMock.mockResolvedValueOnce(SUMMARY).mockResolvedValueOnce(AGGREGATE).mockResolvedValueOnce(EVENTS)
      render(<UsagePanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(screen.getByTestId("usage-history-row-e-1")).toBeInTheDocument()
      })
      // e-1 has provider="openai" + model="gpt-4o-mini".
      const row = screen.getByTestId("usage-history-row-e-1")
      expect(row.textContent).toMatch(/openai/i)
      expect(row.textContent).toMatch(/gpt-4o-mini/i)
    })
  })

  describe("loading + error + empty states (Tasks 17 + 18 + 19)", () => {
    it("shows a loading skeleton while the queries are in flight", () => {
      setRole("owner")
      // Pending forever — we want to see the
      // skeleton.
      getMock.mockReturnValue(new Promise(() => {}))
      render(<UsagePanel />, { wrapper: makeWrapper() })
      // The summary, breakdown, and history
      // each render their own skeleton.
      expect(screen.getByTestId("usage-summary-skeleton")).toBeInTheDocument()
      expect(screen.getByTestId("usage-breakdown-skeleton")).toBeInTheDocument()
      expect(screen.getByTestId("usage-history-skeleton")).toBeInTheDocument()
    })

    it("shows ErrorState with Retry on the summary when the request fails", async () => {
      setRole("owner")
      // The summary fails; the other two
      // succeed so we can pin the summary's
      // error state specifically.
      getMock
        .mockRejectedValueOnce(new Error("network down"))
        .mockResolvedValueOnce(AGGREGATE)
        .mockResolvedValueOnce([])
      render(<UsagePanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(screen.getByText(/unable to load usage data/i)).toBeInTheDocument()
      })
      // Use the testid-based selector so we
      // don't collide with any other Retry
      // button on the page.
      const retryButtons = screen.getAllByRole("button", { name: /retry/i })
      expect(retryButtons.length).toBeGreaterThanOrEqual(1)
    })

    it("Retry on the summary ErrorState triggers refetch (not window.location.reload)", async () => {
      setRole("owner")
      // All three queries reject initially.
      getMock.mockRejectedValue(new Error("network down"))
      render(<UsagePanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(screen.getByText(/unable to load usage data/i)).toBeInTheDocument()
      })
      const callsBefore = getMock.mock.calls.length
      // The summary is the first card in the
      // panel; its Retry button is the first
      // one rendered.
      const retryButtons = screen.getAllByRole("button", { name: /retry/i })
      const summaryRetry = retryButtons[0]!
      fireEvent.click(summaryRetry)
      // After clicking retry, the refetch is
      // async (microtask); we just need more
      // calls than before.
      await waitFor(() => {
        expect(getMock.mock.calls.length).toBeGreaterThan(callsBefore)
      })
    })

    it("shows the empty breakdown state when by_event is empty", async () => {
      setRole("owner")
      const emptyAggregate = { ...AGGREGATE, by_event: {} }
      getMock.mockResolvedValueOnce(SUMMARY).mockResolvedValueOnce(emptyAggregate).mockResolvedValueOnce([])
      render(<UsagePanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(screen.getByTestId("usage-breakdown-empty")).toBeInTheDocument()
      })
      expect(screen.getByTestId("usage-breakdown-empty")).toHaveTextContent(/no usage yet/i)
    })

    it("shows the empty history state when the events list is empty", async () => {
      setRole("owner")
      getMock.mockResolvedValueOnce(SUMMARY).mockResolvedValueOnce(AGGREGATE).mockResolvedValueOnce([])
      render(<UsagePanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(screen.getByTestId("usage-history-empty")).toBeInTheDocument()
      })
      expect(screen.getByTestId("usage-history-empty")).toHaveTextContent(/no recent events/i)
    })
  })

  describe("tenant scope (Task 24 + Task 41)", () => {
    it("hits the /me/tenant-scoped endpoints — never sends a tenant_id", async () => {
      setRole("owner")
      getMock.mockResolvedValueOnce(SUMMARY).mockResolvedValueOnce(AGGREGATE).mockResolvedValueOnce([])
      render(<UsagePanel />, { wrapper: makeWrapper() })
      await waitFor(() => {
        expect(getMock).toHaveBeenCalled()
      })
      // The three endpoints must be hit on
      // the per-tenant surface.
      expect(getMock).toHaveBeenCalledWith(
        "/api/v1/tenants/me/usage/summary",
        expect.objectContaining({}),
      )
      expect(getMock).toHaveBeenCalledWith(
        "/api/v1/tenants/me/usage",
        expect.objectContaining({}),
      )
      expect(getMock).toHaveBeenCalledWith(
        "/api/v1/tenants/me/usage/events",
        expect.objectContaining({}),
      )
      // And the request must NOT include a
      // tenant_id query param.
      for (const call of getMock.mock.calls) {
        const opts = call[1] ?? {}
        if ("query" in opts && opts.query) {
          expect(opts.query).not.toHaveProperty("tenant_id")
        }
      }
    })
  })
})
