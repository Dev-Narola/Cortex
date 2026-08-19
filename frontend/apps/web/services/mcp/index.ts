/**
 * MCP — service barrel.
 *
 * F7 Part 3. The Settings page imports from
 * here. The actual API call (the
 * "Generate MCP Token" button) reuses the
 * existing `createApiKey` service from F7
 * Part 2 — MCP doesn't have its own token
 * endpoint, just a regular API key used as
 * the `X-API-Key` header.
 */

export { MCP_TOOLS, toolsByCategory } from "./tools"
export type {
  McpAuthMethod,
  McpConnection,
  McpToken,
  McpTokenCreated,
  McpTool,
} from "./types"
