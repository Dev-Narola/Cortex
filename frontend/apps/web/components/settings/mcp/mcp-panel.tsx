/**
 * McpPanel — the Settings → MCP screen.
 *
 * **F7 Part 3 (Tasks 4, 7, 8, 10, 22, 23, 32-34).**
 * The composition root for the MCP tab. It
 * owns:
 *   - The "what is MCP" overview
 *   - The connection information (endpoint +
 *     auth methods)
 *   - The available tools list (hand-mirrored
 *     from the backend)
 *   - The tenant-scope messaging
 *   - The "Generate MCP Token" card (which
 *     drives the existing `createApiKey` flow
 *     + the one-time reveal)
 *
 * **No fetched data on the page itself.** The
 * tool list is a hand-maintained constant
 * (`services/mcp/tools.ts`) that mirrors the
 * backend's `MCPToolRegistry`. The endpoint URL
 * is composed from the env config. The token
 * lifecycle is owned by `McpTokenCard`, which
 * delegates to the F7 P2 components.
 *
 * **No "loading / error" state for the page.**
 * The page is entirely static; the only async
 * surface is the Generate flow, which lives
 * inside `McpTokenCard` and uses TanStack Query
 * (loading / error states are owned there).
 *
 * **Permission model.** The "Generate" button
 * is hidden for member / viewer per the
 * backend's `require_admin` guard. The
 * overview + tool list are always visible.
 */
"use client"

import { McpOverview } from "./mcp-overview"
import { McpTokenCard } from "./mcp-token-card"

export function McpPanel() {
  return (
    <div className="space-y-4" data-testid="mcp-panel">
      <McpOverview />
      <McpTokenCard />
    </div>
  )
}
