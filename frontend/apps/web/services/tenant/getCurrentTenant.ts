/**
 * `GET /api/v1/tenants/me` — the caller's tenant (name, slug, plan, status).
 */

import { getApiClient } from "@/lib/auth/api-client"

export interface CurrentTenant {
  id: string
  name: string
  slug: string
  plan: "free" | "pro" | "enterprise"
  is_active: boolean
  created_at: string
}

export async function getCurrentTenant(signal?: AbortSignal): Promise<CurrentTenant> {
  return getApiClient().get<CurrentTenant>("/api/v1/tenants/me", signal ? { signal } : {})
}
