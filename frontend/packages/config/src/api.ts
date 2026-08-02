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

    // MCP (V8)
    mcpSessions: "/api/v1/mcp/sessions",
    mcpTools: "/api/v1/mcp/tools",
    mcpToolInvoke: "/api/v1/mcp/tools/invoke",

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
