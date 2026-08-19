/**
 * MCP — types.
 *
 * **F7 Part 3.** Narrow UI mapping for the
 * Model Context Protocol surface the Settings
 * page consumes.
 *
 * **Important: there is NO dedicated MCP token
 * endpoint.** The actual backend (verified
 * against `Cortex/src/mcp/interface/rest/routes.py`
 * + `Cortex/src/mcp/application/authentication.py`)
 * authenticates MCP requests with EITHER:
 *   - `X-API-Key: <api_key>` (a regular
 *     `ApiKeyModel` row with `ctx_` prefix), or
 *   - `Authorization: Bearer <jwt>` (the
 *     user's session JWT).
 *
 * So the "MCP token" the spec wants is just a
 * regular API key. The Settings page drives the
 * existing `createApiKey` service (F7 Part 2);
 * the resulting key is then used as the
 * `X-API-Key` header by the user's MCP client.
 *
 * **Tool list — IMPORTANT.** The spec's 4 tools
 * (`search_knowledge_base`, `ask_knowledge_base`,
 * `get_document`, `list_recent_documents`) are
 * STALE. The actual backend
 * (`Cortex/src/mcp/application/tool_registry.py`)
 * registers 7 tools with different names. The
 * UI mirrors the real names; the PR flags the
 * discrepancy.
 *
 * **No `tools/list` REST endpoint.** The MCP
 * server exposes a JSON-RPC `tools/list` method,
 * not a REST endpoint. The frontend cannot fetch
 * the live tool list without first negotiating
 * an MCP session (`initialize` + `notifications/
 * initialized` + the JSON-RPC `tools/list` call).
 * For the Settings page the tool list is a
 * hand-maintained constant matching the backend.
 * A future hardening pass can wire the live list
 * by establishing a session.
 */

import type { ApiKey } from "@/services/api-keys"

export type McpAuthMethod = "api_key" | "jwt"

/**
 * A single MCP tool definition. Mirrors the
 * `MCPToolDefinition` dataclass on the backend
 * (`Cortex/src/mcp/application/tool_registry.py`).
 */
export interface McpTool {
  /** The exact tool name a client sends in
   *  the `tools/call` JSON-RPC request. */
  name: string
  /** Human-readable description of what the
   *  tool does. Surfaced as the tool's subtitle
   *  in the Settings page. */
  description: string
  /** Tool category. The UI groups tools by
   *  category in the overview. */
  category: "knowledge" | "retrieval" | "knowledge_graph" | "agent"
  /** Roles allowed to call the tool. The
   *  UI surfaces this only for `upload_document`
   *  (the one admin-only tool). */
  requiredRoles: ReadonlyArray<"owner" | "admin" | "member" | "viewer">
}

/**
 * A description of how an MCP client connects.
 * Used by the Settings page to give the user
 * the exact `X-API-Key` / `Bearer` config they
 * need to paste into their client.
 */
export interface McpConnection {
  /** The MCP JSON-RPC 2.0 endpoint URL the
   *  client POSTs to. Composed from the env
   *  config so the origin is never hardcoded. */
  endpoint: string
  /** The two auth methods the backend accepts. */
  authMethods: ReadonlyArray<McpAuthMethod>
}

/**
 * The result of the Settings page's "Generate
 * MCP Token" action. Internally this is just an
 * `ApiKey` row (see `ApiKeyModel`) — the
 * "MCP token" framing is the *use* of the key
 * (it's used as the `X-API-Key` header by the
 * MCP client), not a separate token type.
 *
 * `ApiKey` already carries the one-time `raw_key`
 * via `ApiKeyCreated` (F7 Part 2); this type
 * re-exports the same shape under a domain-
 * specific name for clarity in the MCP module.
 */
export type McpToken = ApiKey

export type { ApiKeyCreated as McpTokenCreated } from "@/services/api-keys"
