/**
 * MCP — tool list.
 *
 * **F7 Part 3.** Hand-maintained mirror of the
 * backend's `MCPToolRegistry._register_default_cortex_tools()`
 * in `Cortex/src/mcp/application/tool_registry.py`.
 *
 * **Why a constant (not a fetched list).** The MCP
 * server exposes a JSON-RPC `tools/list` method,
 * NOT a REST endpoint. Fetching the live tool list
 * requires first negotiating an MCP session
 * (`initialize` + `notifications/initialized` +
 * `tools/list`); that's not appropriate for the
 * Settings page UI, which renders even before the
 * user has generated a token. The hand-maintained
 * list mirrors the backend's defaults so the UI
 * is honest about the surface a client can talk
 * to. A future hardening pass can wire the live
 * list by establishing a session.
 *
 * **Spec discrepancy.** The F7 Part 3 spec
 * documents 4 tools (`search_knowledge_base`,
 * `ask_knowledge_base`, `get_document`,
 * `list_recent_documents`). The actual backend
 * registers 7 tools with different names. We
 * display the real names here; the PR flags the
 * spec drift.
 *
 * **Categories.** Matches the backend's
 * `category` field on `MCPToolDefinition`:
 *   - `knowledge`       — direct document CRUD
 *   - `retrieval`       — RAG retrieval
 *   - `knowledge_graph` — KG traversal
 *   - `agent`           — agent execution
 *
 * **Roles.** Matches the backend's
 * `required_roles` tuple. The default is
 * `("owner", "admin", "member")`; only
 * `upload_document` requires admin/owner.
 */
import type { McpTool } from "./types"

export const MCP_TOOLS: ReadonlyArray<McpTool> = [
  {
    name: "search_documents",
    description: "Search tenant knowledge base chunks using hybrid vector and full-text search.",
    category: "knowledge",
    requiredRoles: ["owner", "admin", "member"],
  },
  {
    name: "retrieve_context",
    description:
      "Perform hybrid RAG retrieval combining vector search chunks and prioritised Knowledge Graph facts.",
    category: "retrieval",
    requiredRoles: ["owner", "admin", "member"],
  },
  {
    name: "graph_search",
    description:
      "Search Knowledge Graph entities and relationships for a query or specific entity.",
    category: "knowledge_graph",
    requiredRoles: ["owner", "admin", "member"],
  },
  {
    name: "run_agent",
    description: "Trigger execution of an internal Cortex agent for a goal message.",
    category: "agent",
    requiredRoles: ["owner", "admin", "member"],
  },
  {
    name: "list_documents",
    description: "List uploaded knowledge documents for the tenant.",
    category: "knowledge",
    requiredRoles: ["owner", "admin", "member"],
  },
  {
    name: "upload_document",
    description: "Upload and ingest a new text document into tenant knowledge base.",
    category: "knowledge",
    // Admin/owner only — the UI surfaces this in
    // the tool row so the user knows the
    // restriction before they wire up the client.
    requiredRoles: ["owner", "admin"],
  },
  {
    name: "query_memory",
    description: "Query agent execution history and memory steps for a run.",
    category: "agent",
    requiredRoles: ["owner", "admin", "member"],
  },
] as const

/**
 * Group tools by category. The UI uses the
 * returned map to render the tool list as
 * 4 sections (one per category) instead of
 * a flat list — the spec's
 * "Available tools" list reads better when
 * grouped.
 */
export function toolsByCategory(): Record<McpTool["category"], McpTool[]> {
  const grouped: Record<McpTool["category"], McpTool[]> = {
    knowledge: [],
    retrieval: [],
    knowledge_graph: [],
    agent: [],
  }
  for (const tool of MCP_TOOLS) {
    grouped[tool.category].push(tool)
  }
  return grouped
}
