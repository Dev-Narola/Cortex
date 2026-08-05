/**
 * useCreateWorkspace — TanStack Query mutation for
 * `POST /tenants`.
 *
 * **F2 Part 2 (Task 16).** Wraps the `createTenant` service
 * in a `useMutation` so the form can render loading / error
 * states declaratively and the page can drive the theme
 * transition + navigation on `onSuccess`.
 *
 * **Cache key.** The mutation is fire-and-forget; the
 * workspace record is written to the auth store on
 * success, not to the React Query cache. (Future F2+
 * work — fetching the tenant list for a settings page —
 * will use `useQuery({ queryKey: ["tenants"] })`.)
 *
 * **Error normalisation.** The mutation's `error` is the
 * raw `Error` thrown by the api-client. The caller (the
 * form) maps it to a `FrontendError` via `toFrontendError`
 * for consistent messaging.
 */

"use client"

import { useMutation, type UseMutationResult } from "@tanstack/react-query"

import { createTenant, type CreateTenantRequest, type Tenant } from "@/services/tenant"

export type UseCreateWorkspaceResult = UseMutationResult<
  Tenant,
  Error,
  CreateTenantRequest
>

export function useCreateWorkspace(): UseCreateWorkspaceResult {
  return useMutation<Tenant, Error, CreateTenantRequest>({
    mutationFn: (input) => createTenant(input),
  })
}
