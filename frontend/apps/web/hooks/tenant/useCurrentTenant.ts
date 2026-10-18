"use client"

import { useQuery } from "@tanstack/react-query"

import { useAuthStore } from "@/lib/auth/store"
import { getCurrentTenant } from "@/services/tenant"

export function useCurrentTenant() {
  const tenantId = useAuthStore((s) => s.user?.tenantId)
  return useQuery({
    queryKey: ["tenant", "me", tenantId],
    queryFn: ({ signal }) => getCurrentTenant(signal),
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
  })
}
