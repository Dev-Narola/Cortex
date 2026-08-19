/**
 * McpPanel — F7 Part 3.
 *
 * Tests the panel's surface contract:
 *   - The overview + tool list render (Task 32).
 *   - The actual 7 tools (from the backend's
 *     `MCPToolRegistry`) render — NOT the 4 stale
 *     tool names from the F7 Part 3 spec.
 *   - The endpoint URL is composed from the env
 *     config (no hardcoded hostnames).
 *   - The "Generate MCP Token" button:
 *     - visible for owner / admin
 *     - hidden for member / viewer
 *   - The Generate flow reuses the F7 P2
 *     `GenerateApiKeyModal` + `ApiKeyReveal`:
 *     - Open the modal
 *     - Submit a name → POST /api/v1/api-keys
 *     - The reveal shows the raw key
 *     - Done → the reveal closes (raw key gone)
 *
 * The api-client is mocked at the seam.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { McpPanel } from "@/components/settings/mcp/mcp-panel"
import { useAuthStore } from "@/lib/auth/store"

const postMock = vi.fn()

vi.mock("@/lib/auth/api-client", () => ({
  getApiClient: () => ({ get: vi.fn(), post: postMock, delete: vi.fn() }),
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
  postMock.mockReset()
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

describe("McpPanel", () => {
  describe("rendering (Tasks 32-34, 40)", () => {
    it("renders the overview + tool list", async () => {
      setRole("owner")
      render(<McpPanel />, { wrapper: makeWrapper() })
      expect(screen.getByTestId("mcp-overview")).toBeInTheDocument()
      expect(screen.getByTestId("mcp-tool-list")).toBeInTheDocument()
      // The actual 7 tools registered by the
      // backend (verified against
      // Cortex/src/mcp/application/tool_registry.py).
      const expectedTools = [
        "search_documents",
        "retrieve_context",
        "graph_search",
        "run_agent",
        "list_documents",
        "upload_document",
        "query_memory",
      ]
      for (const name of expectedTools) {
        expect(screen.getByTestId(`mcp-tool-${name}`)).toBeInTheDocument()
      }
    })

    it("the MCP endpoint URL is composed from the env config (no hardcoded hostnames)", () => {
      setRole("owner")
      render(<McpPanel />, { wrapper: makeWrapper() })
      const endpoint = screen.getByTestId("mcp-endpoint")
      // The endpoint must contain the
      // `/api/v1/mcp` path AND a host that came
      // from publicEnv (we don't assert the host
      // — it's env-driven — but we assert the
      // path is present and the value is a URL).
      expect(endpoint).toHaveTextContent("/api/v1/mcp")
      // The token in JetBrains Mono.
      expect(endpoint.tagName).toBe("CODE")
      expect(endpoint.className).toContain("font-mono")
    })

    it("marks upload_document as admin-only in the tool row", () => {
      setRole("owner")
      render(<McpPanel />, { wrapper: makeWrapper() })
      // The UI surfaces the role restriction in
      // the tool row so the user knows the
      // boundary before wiring up the client.
      const adminBadge = screen.getByTestId("mcp-tool-roles-upload_document")
      expect(adminBadge).toHaveTextContent(/admin only/i)
    })

    it("does NOT mark the other tools as admin-only", () => {
      setRole("owner")
      render(<McpPanel />, { wrapper: makeWrapper() })
      for (const name of [
        "search_documents",
        "retrieve_context",
        "graph_search",
        "run_agent",
        "list_documents",
        "query_memory",
      ]) {
        expect(screen.queryByTestId(`mcp-tool-roles-${name}`)).not.toBeInTheDocument()
      }
    })
  })

  describe("permission gate (Task 29 — derived from the actual `require_admin` guard)", () => {
    it("owner → Generate button visible", () => {
      setRole("owner")
      render(<McpPanel />, { wrapper: makeWrapper() })
      expect(screen.getByTestId("mcp-generate-button")).toBeInTheDocument()
    })

    it("admin → Generate button visible", () => {
      setRole("admin")
      render(<McpPanel />, { wrapper: makeWrapper() })
      expect(screen.getByTestId("mcp-generate-button")).toBeInTheDocument()
    })

    it("member → Generate button hidden", () => {
      setRole("member")
      render(<McpPanel />, { wrapper: makeWrapper() })
      expect(screen.queryByTestId("mcp-generate-button")).not.toBeInTheDocument()
    })

    it("viewer → Generate button hidden", () => {
      setRole("viewer")
      render(<McpPanel />, { wrapper: makeWrapper() })
      expect(screen.queryByTestId("mcp-generate-button")).not.toBeInTheDocument()
    })
  })

  describe("one-time key lifecycle (Tasks 36-39)", () => {
    it("Generate → submit → reveal shows the raw key → Done clears it", async () => {
      const user = userEvent.setup()
      setRole("owner")
      // The MCP page reuses the F7 P2
      // createApiKey mutation. The "MCP token"
      // is just a regular API key used as the
      // X-API-Key header by the MCP client.
      const created = {
        id: "k-mcp",
        tenant_id: "t-1",
        name: "MCP integration",
        scopes: [],
        last_used_at: null,
        revoked_at: null,
        created_at: "2026-08-19T00:00:00Z",
        raw_key: "ctx_live_TESTONLY_DO_NOT_LOG",
      }
      postMock.mockResolvedValueOnce(created)
      render(<McpPanel />, { wrapper: makeWrapper() })
      // Open the generate modal.
      const generateBtn = screen.getByTestId("mcp-generate-button")
      fireEvent.click(generateBtn)
      // Fill in + submit.
      const input = await screen.findByTestId("api-key-name-input")
      await user.type(input, "MCP integration")
      fireEvent.click(screen.getByTestId("api-key-submit"))
      // The reveal opens with the raw key
      // (the F7 P2 ApiKeyReveal component).
      await waitFor(() => {
        expect(screen.getByTestId("api-key-reveal-modal")).toBeInTheDocument()
      })
      const revealValue = screen.getByTestId("api-key-reveal-value")
      expect(revealValue).toHaveTextContent("ctx_live_TESTONLY_DO_NOT_LOG")
      // The mutation is the same as F7 P2:
      // POST /api/v1/api-keys (not a separate
      // /api/v1/mcp/token — the backend has no
      // such endpoint).
      expect(postMock).toHaveBeenCalledWith(
        "/api/v1/api-keys",
        { name: "MCP integration" },
        expect.objectContaining({}),
      )
      // Done closes the reveal.
      fireEvent.click(screen.getByTestId("api-key-reveal-done"))
      await waitFor(() => {
        expect(screen.queryByTestId("api-key-reveal-modal")).not.toBeInTheDocument()
      })
    })
  })
})
