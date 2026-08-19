/**
 * Knowledge Graph — API service layer.
 *
 * **F6 Part 2.** One file per F0–F5 convention
 * (see `services/documents/`, `services/conversations/`)
 * — the API service is the only place that knows
 * about HTTP. Components + hooks consume the
 * service via TanStack Query; the Three.js layer
 * never sees a URL.
 *
 * **The 5 methods we ship in Part 2:**
 *   - ``getEntity(id)``              — entity detail
 *   - ``listEntityRelations(id)``    — every relationship touching an entity
 *   - ``listEntityNeighbors(id)``    — adjacent entities (the graph's "expand" view)
 *   - ``searchGraph(query, ...)``    — free-text search across entities + relations
 *   - ``getPath(source, target)``    — shortest path between two entities
 *
 * **Route mount.** The backend mounts the KG
 * router at ``/api/v1/graph`` (not ``/kg`` as the
 * F0 spec originally assumed — verified against
 * `src/api.py` + `src/knowledge_graph/interface/rest/routes.py`).
 *
 * **Auth + tenant scope.** Inherited from the
 * api-client singleton. The JWT is injected
 * automatically, the 401 silent-refresh path
 * runs on every request, and the backend's
 * `get_current_user` enforces tenant + user
 * scope at the SQL level. The frontend never
 * passes a `tenant_id` query param.
 *
 * **Abort signals.** Each function accepts an
 * optional `AbortSignal` so the hook layer can
 * cancel an in-flight request on unmount (no
 * "state update on unmounted component"
 * warnings).
 */

import { getApiClient } from "@/lib/auth/api-client"

import type {
  KGEntity,
  KGNeighborResponse,
  KGPathResponse,
  KGRelationship,
  KGRelationshipListResponse,
  KGSearchResponse,
} from "@/types/kg"

// ---------------------------------------------------------------------------
// getEntity
// ---------------------------------------------------------------------------

export interface GetEntityParams {
  id: string
  signal?: AbortSignal
}

export async function getEntity(
  params: GetEntityParams,
): Promise<KGEntity> {
  const client = getApiClient()
  return client.get<KGEntity>(
    `/api/v1/graph/entities/${encodeURIComponent(params.id)}`,
    params.signal ? { signal: params.signal } : {},
  )
}

// ---------------------------------------------------------------------------
// listEntityRelations
// ---------------------------------------------------------------------------

export interface ListEntityRelationsParams {
  id: string
  /** Relationship-type filter. Optional. */
  type?: string
  /** Page size. Backend default 50, max 200. */
  limit?: number
  signal?: AbortSignal
}

export async function listEntityRelations(
  params: ListEntityRelationsParams,
): Promise<KGRelationshipListResponse> {
  const client = getApiClient()
  const query: Record<string, string | number> = {}
  if (params.type) query.type = params.type
  if (params.limit !== undefined) query.limit = params.limit
  return client.get<KGRelationshipListResponse>(
    "/api/v1/graph/relationships",
    {
      ...(Object.keys(query).length > 0 ? { query: { ...query, entity_id: params.id } } : { query: { entity_id: params.id } }),
      ...(params.signal ? { signal: params.signal } : {}),
    },
  )
}

// ---------------------------------------------------------------------------
// listEntityNeighbors
// ---------------------------------------------------------------------------

export interface ListEntityNeighborsParams {
  id: string
  /** "outgoing" | "incoming" | "both". Default "both". */
  direction?: "outgoing" | "incoming" | "both"
  type?: string
  limit?: number
  signal?: AbortSignal
}

export async function listEntityNeighbors(
  params: ListEntityNeighborsParams,
): Promise<KGNeighborResponse> {
  const client = getApiClient()
  const query: Record<string, string | number> = { entity_id: params.id }
  if (params.direction) query.direction = params.direction
  if (params.type) query.type = params.type
  if (params.limit !== undefined) query.limit = params.limit
  return client.get<KGNeighborResponse>(
    `/api/v1/graph/entities/${encodeURIComponent(params.id)}/neighbors`,
    { query, ...(params.signal ? { signal: params.signal } : {}) },
  )
}

// ---------------------------------------------------------------------------
// searchGraph
// ---------------------------------------------------------------------------

export interface SearchGraphParams {
  query: string
  type?: string
  limit?: number
  signal?: AbortSignal
}

export async function searchGraph(
  params: SearchGraphParams,
): Promise<KGSearchResponse> {
  const client = getApiClient()
  const query: Record<string, string | number> = { query: params.query }
  if (params.type) query.type = params.type
  if (params.limit !== undefined) query.limit = params.limit
  return client.get<KGSearchResponse>("/api/v1/graph/search", {
    query,
    ...(params.signal ? { signal: params.signal } : {}),
  })
}

// ---------------------------------------------------------------------------
// getPath
// ---------------------------------------------------------------------------

export interface GetPathParams {
  source: string
  target: string
  max_depth?: number
  signal?: AbortSignal
}

export async function getPath(
  params: GetPathParams,
): Promise<KGPathResponse> {
  const client = getApiClient()
  const query: Record<string, string | number> = {
    source: params.source,
    target: params.target,
  }
  if (params.max_depth !== undefined) query.max_depth = params.max_depth
  return client.get<KGPathResponse>("/api/v1/graph/path", {
    query,
    ...(params.signal ? { signal: params.signal } : {}),
  })
}

// ---------------------------------------------------------------------------
// Re-export for convenience — components that want
// the raw type without importing from @/types/kg.
// ---------------------------------------------------------------------------

export type {
  KGEntity,
  KGNeighborResponse,
  KGPathResponse,
  KGRelationship,
  KGRelationshipListResponse,
  KGSearchResponse,
} from "@/types/kg"

// Helper: type guard that also flattens the
// relationship-only shape used by some search
// results into a list response.
export function asRelationshipList(
  rels: KGRelationship[],
  limit = 200,
): KGRelationshipListResponse {
  return { items: rels.slice(0, limit), limit }
}
