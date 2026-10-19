"use client"

import { useQuery } from "@tanstack/react-query"

import { getGraphOverview } from "@/services/graph/kg"

import { kgKeys } from "./kgKeys"

/** Whole-workspace graph shown before the user searches or picks an entity. */
export function useKGOverview(enabled: boolean) {
  return useQuery({
    queryKey: [...kgKeys.all, "overview"],
    queryFn: ({ signal }) => getGraphOverview(signal),
    enabled,
    staleTime: 60_000,
  })
}
