/**
 * DashboardView — every card renders backend data, fails per card, and
 * gates owner/admin-only activity. Hooks are mocked at the module boundary.
 */

import { render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type Q = { data?: unknown; isLoading?: boolean; isError?: boolean }
const state: {
  docs: Record<string, Q>
  conversations: Q
  usage: Q
  audit: Q
} = { docs: {}, conversations: {}, usage: {}, audit: {} }

vi.mock("@/hooks/documents", () => ({
  useDocuments: (p: { status?: string }) => state.docs[p.status ?? "all"] ?? {},
}))
vi.mock("@/hooks/chat", () => ({ useConversations: () => state.conversations }))
vi.mock("@/hooks/usage", () => ({ useTenantUsageSummary: () => state.usage }))
vi.mock("@/hooks/audit", () => ({
  useAuditLog: (p: { enabled: boolean }) => (p.enabled ? state.audit : {}),
}))
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { kind: "healthy", latencyMs: 42, version: null }, isLoading: false }),
}))

import { DashboardView } from "@/app/(app)/app/dashboard/DashboardView"
import { useAuthStore } from "@/lib/auth/store"

function seed(role: "owner" | "member") {
  useAuthStore.setState({
    user: { id: "u1", email: "ada@acme.dev", role, tenantId: "t1" },
    tenant: { id: "t1", slug: "acme", workspace: "Acme Inc" },
  })
}

const doc = {
  id: "d1",
  title: "Platform guide.md",
  mime_type: "text/markdown",
  status: "indexed",
  created_at: "2026-10-18T10:00:00Z",
}

describe("DashboardView", () => {
  beforeEach(() => {
    state.docs = {
      all: { data: { items: [doc], total: 12, limit: 5, offset: 0 } },
      indexed: { data: { items: [], total: 9 } },
      failed: { data: { items: [], total: 1 } },
    }
    state.conversations = {
      data: {
        items: [
          { id: "c1", title: "How does hybrid search work?", updatedAt: "2026-10-18T09:00:00Z" },
        ],
        total: 3,
      },
    }
    state.usage = {
      data: {
        requests: 1530,
        embedding_tokens: 1000,
        completion_input_tokens: 500,
        completion_output_tokens: 500,
        rerank_units: 7,
        estimated_cost_usd: 0.42,
      },
    }
    state.audit = {
      data: {
        items: [{ id: "a1", action: "document.uploaded", created_at: "2026-10-18T09:30:00Z" }],
      },
    }
  })
  afterEach(() => useAuthStore.getState().clear())

  it("shows backend counts, never placeholders", () => {
    seed("owner")
    render(<DashboardView />)
    expect(screen.getByText("Acme Inc")).toBeInTheDocument()
    expect(screen.getByText("12")).toBeInTheDocument()
    expect(screen.getByText("9 indexed and searchable")).toBeInTheDocument()
    expect(screen.getByText("2")).toBeInTheDocument() // 12 - 9 indexed - 1 failed
    expect(screen.getByText("1 failed, retry from Documents")).toBeInTheDocument()
    expect(screen.getByText("1.5K")).toBeInTheDocument()
    expect(screen.getByText(/\$0\.42 estimated/)).toBeInTheDocument()
    expect(screen.getByText("Platform guide.md")).toBeInTheDocument()
    expect(screen.getByText("How does hybrid search work?")).toBeInTheDocument()
    expect(screen.getByText("42 ms")).toBeInTheDocument()
  })

  it("marks a failed source as unavailable instead of showing zero", () => {
    seed("owner")
    state.usage = { isError: true }
    render(<DashboardView />)
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText(/estimated/)).not.toBeInTheDocument()
  })

  it("leads with the upload call-to-action only when the workspace is empty", () => {
    seed("member")
    state.docs.all = { data: { items: [], total: 0, limit: 5, offset: 0 } }
    render(<DashboardView />)
    expect(screen.getByRole("heading", { name: "Add your first document" })).toBeInTheDocument()
  })

  it("hides the audit activity panel from members", () => {
    seed("member")
    render(<DashboardView />)
    expect(screen.queryByText("Recent activity")).not.toBeInTheDocument()
    expect(screen.queryByText("document.uploaded")).not.toBeInTheDocument()
  })

  it("shows recent activity to owners", () => {
    seed("owner")
    render(<DashboardView />)
    expect(screen.getByText("document.uploaded")).toBeInTheDocument()
  })
})
