/**
 * API endpoint registry.
 *
 * The base URL comes from `NEXT_PUBLIC_API_URL`. Every concrete
 * endpoint path lives here so a backend rename is a one-line
 * change and the contract test in V9 has a single source of
 * truth to diff against.
 */

import { publicEnv } from "./env"

export const apiConfig = {
  baseUrl: publicEnv.NEXT_PUBLIC_API_URL,
  wsUrl: publicEnv.NEXT_PUBLIC_WS_URL,
  graphqlUrl: publicEnv.NEXT_PUBLIC_GRAPHQL_URL,
  // Future: when the MCP server gets its own origin, this will
  // diverge from `baseUrl`. Centralising the field now means
  // the swap is a one-line env change.
  mcpUrl: publicEnv.NEXT_PUBLIC_API_URL,
  // Backend's OpenAPI spec URL — consumed by the codegen script
  // in `packages/api-client/scripts/generate.ts`.
  openapiUrl: `${publicEnv.NEXT_PUBLIC_API_URL.replace(/\/$/, "")}/openapi.json`,
  appName: publicEnv.NEXT_PUBLIC_APP_NAME,
  appUrl: publicEnv.NEXT_PUBLIC_APP_URL,

  paths: {
    // Identity (V1)
    authLogin: "/api/v1/auth/login",
    authRefresh: "/api/v1/auth/refresh",
    authLogout: "/api/v1/auth/logout",
    me: "/api/v1/tenants/me",
    users: "/api/v1/users",

    // Knowledge (V2)
    documents: "/api/v1/documents",
    documentById: (id: string) => `/api/v1/documents/${id}`,
    chunksById: (id: string) => `/api/v1/chunks/${id}`,
    documentUpload: "/api/v1/documents/upload",

    // Retrieval (V3 / V5)
    search: "/api/v1/search",
    answer: "/api/v1/answer",

    // Knowledge Graph (V7)
    graphExtract: "/api/v1/graph/extract",
    graphEntities: "/api/v1/graph/entities",
    graphRelations: "/api/v1/graph/relations",
    graphNeighbors: (id: string) => `/api/v1/graph/neighbors/${id}`,

    // Conversations (V3)
    conversations: "/api/v1/conversations",
    conversationById: (id: string) => `/api/v1/conversations/${id}`,

    // Agents (V6)
    agents: "/api/v1/agents",
    agentById: (id: string) => `/api/v1/agents/${id}`,
    agentInvoke: (id: string) => `/api/v1/agents/${id}/invoke`,

    // MCP (V8) — JSON-RPC 2.0 over HTTP POST.
    // The MCP server exposes a single endpoint;
    // clients negotiate the session via the
    // `initialize` JSON-RPC method and authenticate
    // with either `X-API-Key: <api_key>` or
    // `Authorization: Bearer <jwt>`. The actual
    // tool list is returned by the `tools/list`
    // JSON-RPC method (not a REST endpoint).
    mcpJsonRpc: "/api/v1/mcp",
    /**
     * Build the full MCP URL the user copies
     * into their client config. Composed from
     * `apiConfig.mcpUrl` so the origin is driven
     * by the env, not hardcoded in the page.
     */
    mcpJsonRpcUrl: (mcpUrl: string) =>
      `${mcpUrl.replace(/\/$/, "")}/api/v1/mcp`,

    // Billing / Admin (V1)
    billingUsage: "/api/v1/billing/usage",
    adminAudit: "/api/v1/admin/audit",

    // Health (V9)
    health: "/health",
    healthLive: "/health/live",
    healthReady: "/health/ready",

    // OpenAPI (V9 contract generation)
    openapi: "/openapi.json",
  },

  ws: {
    conversation: (id: string) => `/ws/conversations/${id}`,
    ingestionStatus: (documentId: string) => `/ws/documents/${documentId}/status`,
  },
} as const

export type ApiConfig = typeof apiConfig
