/**
 * MCP — service tests.
 *
 * F7 Part 3. The MCP service is a hand-maintained
 * constant (`services/mcp/tools.ts`) that mirrors
 * the backend's `MCPToolRegistry`. The tests
 * pin:
 *   - the exact 7 tool names (NOT the spec's 4
 *     stale names)
 *   - the `upload_document` tool is the only one
 *     restricted to admin / owner
 *   - the `toolsByCategory()` helper groups
 *     correctly
 *
 * The endpoint URL test is a separate test that
 * uses the env config (no hardcoded hostnames).
 */

import { describe, expect, it } from "vitest"

import { apiConfig } from "@cortex/config"

import { MCP_TOOLS, toolsByCategory } from "@/services/mcp/tools"

describe("MCP_TOOLS (F7 Part 3 — actual backend contract)", () => {
  it("contains the 7 tools registered by the backend", () => {
    expect(MCP_TOOLS).toHaveLength(7)
    const names = MCP_TOOLS.map((t) => t.name)
    expect(names).toEqual([
      "search_documents",
      "retrieve_context",
      "graph_search",
      "run_agent",
      "list_documents",
      "upload_document",
      "query_memory",
    ])
  })

  it("upload_document is restricted to owner + admin", () => {
    const upload = MCP_TOOLS.find((t) => t.name === "upload_document")
    expect(upload).toBeDefined()
    expect(upload?.requiredRoles).toEqual(["owner", "admin"])
  })

  it("every other tool is available to member", () => {
    for (const tool of MCP_TOOLS) {
      if (tool.name === "upload_document") continue
      expect(tool.requiredRoles).toContain("member")
    }
  })

  it("the SPEC's 4 stale tool names are NOT in the list", () => {
    // The F7 Part 3 spec documents 4 tool names
    // that don't exist in the actual backend.
    // We assert they are NOT shown — better to
    // be honest about the surface than to
    // document fake tools.
    const specStaleNames = [
      "search_knowledge_base",
      "ask_knowledge_base",
      "get_document",
      "list_recent_documents",
    ]
    const actualNames = new Set(MCP_TOOLS.map((t) => t.name))
    for (const stale of specStaleNames) {
      expect(actualNames.has(stale)).toBe(false)
    }
  })
})

describe("toolsByCategory (F7 Part 3)", () => {
  it("groups tools by their declared category", () => {
    const grouped = toolsByCategory()
    expect(grouped.knowledge.map((t) => t.name).sort()).toEqual([
      "list_documents",
      "search_documents",
      "upload_document",
    ])
    expect(grouped.retrieval.map((t) => t.name)).toEqual(["retrieve_context"])
    expect(grouped.knowledge_graph.map((t) => t.name)).toEqual(["graph_search"])
    expect(grouped.agent.map((t) => t.name).sort()).toEqual(["query_memory", "run_agent"])
  })
})

describe("MCP endpoint URL (no hardcoded hostnames)", () => {
  it("is composed from apiConfig.mcpUrl + the JSON-RPC path", () => {
    const url = apiConfig.paths.mcpJsonRpcUrl(apiConfig.mcpUrl)
    // The path must end with the JSON-RPC 2.0
    // route. The host comes from the env (can
    // be localhost in dev / a real host in
    // prod), so we don't assert on the host.
    expect(url).toMatch(/\/api\/v1\/mcp$/)
    // The URL must come from the env config —
    // it must NOT be a hardcoded literal in the
    // source. The easiest way to assert this is
    // that the URL is a non-empty string and
    // starts with the configured base (the
    // `mcpUrl` field is the one the UI reads).
    expect(url).toContain(apiConfig.mcpUrl.replace(/\/$/, ""))
  })

  it("is NOT hardcoded — the path is the documented JSON-RPC endpoint", () => {
    // The path is the single source of truth
    // for the endpoint. If a future migration
    // moves MCP to a different origin, only the
    // env config changes; the path stays.
    expect(apiConfig.paths.mcpJsonRpc).toBe("/api/v1/mcp")
  })
})
