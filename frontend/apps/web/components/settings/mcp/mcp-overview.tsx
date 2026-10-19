/**
 * McpOverview — the "what is MCP" panel.
 *
 * **F7 Part 3 (Tasks 6, 7, 18, 19, 20, 21).**
 * The static surface of the MCP page: what
 * the protocol is, what tools the backend
 * exposes, the connection URL the user
 * pastes into their client, and the
 * tenant-scope messaging.
 *
 * **No fetched data.** The tool list is a
 * hand-maintained constant (see
 * `services/mcp/tools.ts`) — mirrors the
 * backend's `MCPToolRegistry`. The endpoint
 * URL is composed from `apiConfig.mcpUrl`
 * (env-driven) + the documented path.
 *
 * **Spec drift.** The F7 Part 3 spec documents
 * 4 tool names; the actual backend registers
 * 7 with different names. The PR flags the
 * discrepancy; the UI shows the real names
 * (better to be honest about the surface than
 * to display fake tools).
 *
 * **Tenant-scope messaging.** Per the PRD: the
 * MCP tools are scoped to a single
 * authenticated tenant. The UI surfaces this
 * prominently — the user's client config is
 * "this workspace only".
 */
"use client"

import { Card, CardContent } from "@cortex/ui"

import { apiConfig } from "@cortex/config"

import { type McpTool, toolsByCategory } from "@/services/mcp"
import { SectionHeader } from "../section-header"

function categoryLabel(category: McpTool["category"]): string {
  switch (category) {
    case "knowledge":
      return "Knowledge"
    case "retrieval":
      return "Retrieval"
    case "knowledge_graph":
      return "Knowledge Graph"
    case "agent":
      return "Agents"
  }
}

export function McpOverview() {
  const grouped = toolsByCategory()
  const endpoint = apiConfig.paths.mcpJsonRpcUrl(apiConfig.mcpUrl)

  return (
    <div className="space-y-4" data-testid="mcp-overview">
      <SectionHeader
        title="MCP"
        description="Connect Cortex to MCP-compatible clients such as Claude and other AI agents. The client authenticates with an API key (the same one you manage under Settings → API Keys) and calls the tools below over JSON-RPC 2.0."
      />

      <Card radius="xl">
        <CardContent className="space-y-3 p-0 sm:p-1">
          <h3 className="font-display text-[0.9375rem] font-semibold tracking-tight">Connection</h3>
          <dl className="space-y-2 text-xs">
            <div>
              <dt className="font-medium uppercase tracking-wider text-faint">Endpoint</dt>
              <dd className="mt-1">
                <code
                  className="block break-all rounded-lg border border-border bg-background-2 px-3 py-2 font-mono text-sm text-foreground"
                  data-testid="mcp-endpoint"
                >
                  {endpoint}
                </code>
              </dd>
            </div>
            <div>
              <dt className="font-medium uppercase tracking-wider text-faint">Auth methods</dt>
              <dd className="mt-1 space-y-1 text-muted-foreground">
                <div>
                  <span className="font-mono text-xs">X-API-Key</span> — a regular API key (use
                  Settings → API Keys to create one for your client).
                </div>
                <div>
                  <span className="font-mono text-xs">Authorization: Bearer</span> — a JWT access
                  token (use your session token).
                </div>
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card radius="xl">
        <CardContent className="space-y-3 p-0 sm:p-1">
          <h3 className="font-display text-[0.9375rem] font-semibold tracking-tight">
            Available tools
          </h3>
          <p className="text-xs text-faint">
            The tools your MCP client can call. Tools are tenant-scoped — clients see only this
            workspace&apos;s data.
          </p>
          <div className="space-y-4" data-testid="mcp-tool-list">
            {(Object.keys(grouped) as McpTool["category"][]).map((category) => {
              const tools = grouped[category]
              if (tools.length === 0) return null
              return (
                <div key={category}>
                  <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-faint">
                    {categoryLabel(category)}
                  </h4>
                  <ul className="space-y-1.5">
                    {tools.map((tool) => (
                      <li
                        key={tool.name}
                        className="rounded-md border border-border bg-muted px-3 py-2"
                        data-testid={`mcp-tool-${tool.name}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <code
                            className="font-mono text-sm text-foreground"
                            data-testid={`mcp-tool-name-${tool.name}`}
                          >
                            {tool.name}
                          </code>
                          {tool.requiredRoles.length === 2 ? (
                            <span
                              className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warning"
                              data-testid={`mcp-tool-roles-${tool.name}`}
                            >
                              Admin only
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{tool.description}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card radius="xl">
        <CardContent className="space-y-2 p-0 sm:p-1">
          <h3 className="font-display text-[0.9375rem] font-semibold tracking-tight">
            Tenant-scoped access
          </h3>
          <p className="text-sm text-muted-foreground">
            MCP clients authenticated with this configuration can access only this workspace&apos;s
            Cortex knowledge base. Cross-tenant access is technically impossible — the backend
            resolves the tenant from the authentication credentials at the SQL level.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
