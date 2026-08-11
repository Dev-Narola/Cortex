/**
 * useConversations — TanStack Query hook for the
 * conversation history list.
 *
 * **F5 Part 1 (Task 5).** Single hook for every
 * component that reads the conversation list.
 *
 * **Architecture.**
 *   Component (ConversationList)
 *     ↓
 *   useConversations()
 *     ↓
 *   TanStack Query (key: `conversationsKeys.list({limit})`)
 *     ↓
 *   listConversations() — `lib/api/conversations.ts`
 *     ↓
 *   GET /conversations
 *
 * **Stale time.** The list is "background state" —
 * the user is reading it but won't notice a
 * 30-second stale entry. The 30s window keeps
 * the cache warm across the typical
 * "open conversation → click another →
 * return" round-trip.
 *
 * **Retry.** Two retries on transient errors
 * (network blip, 5xx). 404 is a real state
 * (the user was deleted, the tenant was
 * archived) and we don't retry it.
 *
 * **No polling.** The spec is explicit: no
 * periodic refetch. New conversations +
 * renames invalidate the list explicitly via
 * `useCreateConversation` (today) +
 * `useRenameConversation` (Part 2).
 *
 * **Tenant isolation.** The backend enforces
 * tenant + user scope at the SQL level via
 * `get_current_user`. The frontend never
 * accepts an arbitrary id; the URL
 * `/chat/{id}` is the only way the user reaches
 * a detail, and the backend's 404 path is the
 * security boundary.
 */

"use client"

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query"

import { ApiError } from "@cortex/api-client"

import {
  deleteConversation,
  listConversations,
  renameConversation,
  type DeleteConversationParams,
  type RenameConversationParams,
} from "@/services/conversations"
import type {
  Conversation,
  ConversationListResponse,
} from "@/types/conversation"

import { conversationsKeys } from "./conversationKeys"

export interface UseConversationsParams {
  /** Page size. Defaults to 50 (the backend default). */
  limit?: number
  /** Zero-based offset. Defaults to 0. */
  offset?: number
  /**
   * Disable the query entirely. Useful when the
   * user is signed out (the api-client would 401
   * otherwise) or when the chat route is being
   * loaded as part of a marketing flow.
   */
  enabled?: boolean
}

export type UseConversationsResult = UseQueryResult<
  ConversationListResponse,
  Error
>

export function useConversations(
  params: UseConversationsParams = {},
): UseConversationsResult {
  const { limit, offset, enabled = true } = params
  return useQuery<ConversationListResponse, Error>({
    queryKey: conversationsKeys.list({ limit, offset }),
    queryFn: ({ signal }) =>
      listConversations({
        ...(limit !== undefined ? { limit } : {}),
        ...(offset !== undefined ? { offset } : {}),
        signal,
      }),
    enabled,
    staleTime: 30_000,
    retry: (failureCount, error) => {
      // 404 + 403 are real authorisation states;
      // 401 is handled by the api-client's silent
      // refresh path. Everything else is transient.
      if (error instanceof ApiError) {
        if (error.status === 404 || error.status === 403) return false
      }
      return failureCount < 2
    },
  })
}

// ---------------------------------------------------------------------------
// useRenameConversation — F5 Part 2.
// ---------------------------------------------------------------------------
//
// TanStack mutation that calls PATCH /conversations/{id}
// via `renameConversation`. The mutation:
//
//   1. Calls the service.
//   2. On success, patches the list cache in
//      place (setQueryData) — the response carries
//      the updated `Conversation`, so the new
//      title is visible immediately without a
//      refetch round-trip.
//   3. On success, also patches the matching
//      detail cache (`["conversations","detail",id]`)
//      so the active conversation's title bar
//      (rendered from the detail cache) stays in
//      sync with the list.
//   4. Returns the updated Conversation so the
//      caller can move on (e.g. close the inline
//      editor).
//
// We deliberately do NOT use an optimistic
// update here. The spec (Task 21) recommends
// server-confirmed: `UI title = backend title`
// after the mutation. A failed rename must not
// appear successful.

export type UseRenameConversationResult = UseMutationResult<
  Conversation,
  Error,
  RenameConversationParams,
  { previousLists: Array<[readonly unknown[], ConversationListResponse | undefined]> }
>

export function useRenameConversation(): UseRenameConversationResult {
  const qc = useQueryClient()
  return useMutation<
    Conversation,
    Error,
    RenameConversationParams,
    { previousLists: Array<[readonly unknown[], ConversationListResponse | undefined]> }
  >({
    mutationKey: ["conversations", "rename"],
    mutationFn: ({ id, title }) => renameConversation({ id, title }),
    onMutate: async ({ id, title }) => {
      // Cancel any in-flight refetches so they
      // don't overwrite our patch. We capture
      // the previous list data so the rollback
      // (on error) is symmetric.
      await qc.cancelQueries({ queryKey: conversationsKeys.lists() })
      const previousLists = qc.getQueriesData<ConversationListResponse>({
        queryKey: conversationsKeys.lists(),
      })
      qc.setQueriesData<ConversationListResponse>(
        { queryKey: conversationsKeys.lists() },
        (prev) => {
          if (!prev) return prev
          return {
            ...prev,
            items: prev.items.map((c) =>
              c.id === id ? { ...c, title } : c,
            ),
          }
        },
      )
      return { previousLists }
    },
    onError: (_err, _vars, context) => {
      // Rollback the list cache to what it was
      // before `onMutate` patched it. The detail
      // cache isn't patched optimistically, so
      // it doesn't need a rollback.
      if (!context) return
      for (const [key, data] of context.previousLists) {
        qc.setQueryData(key, data)
      }
    },
    onSuccess: (updated) => {
      // Server-confirmed title. Re-place the
      // list cache with the authoritative row so
      // any clock-skewed `updated_at` lands in
      // the UI; patch the detail cache so the
      // open conversation's title bar updates.
      qc.setQueriesData<ConversationListResponse>(
        { queryKey: conversationsKeys.lists() },
        (prev) => {
          if (!prev) return prev
          return {
            ...prev,
            items: prev.items.map((c) =>
              c.id === updated.id ? updated : c,
            ),
          }
        },
      )
      qc.setQueryData<Conversation>(
        conversationsKeys.detail(updated.id),
        (prev) => (prev ? { ...prev, ...updated } : prev),
      )
    },
  })
}

// ---------------------------------------------------------------------------
// useDeleteConversation — F5 Part 2.
// ---------------------------------------------------------------------------
//
// TanStack mutation that calls DELETE
// /conversations/{id} via `deleteConversation`.
// The mutation:
//
//   1. Calls the service.
//   2. On success, removes the row from every
//      list cache page in place (the user
//      shouldn't see a stale "still here" row).
//   3. On success, removes the matching detail
//      cache so any subscriber to the deleted
//      conversation id is cleared.
//   4. Returns `void` (backend responds 204).
//      The caller is responsible for navigation
//      off the deleted route.

export type UseDeleteConversationResult = UseMutationResult<
  void,
  Error,
  DeleteConversationParams,
  {
    previousLists: Array<[readonly unknown[], ConversationListResponse | undefined]>
    previousDetail: Conversation | undefined
  }
>

export function useDeleteConversation(): UseDeleteConversationResult {
  const qc = useQueryClient()
  return useMutation<
    void,
    Error,
    DeleteConversationParams,
    {
      previousLists: Array<[readonly unknown[], ConversationListResponse | undefined]>
      previousDetail: Conversation | undefined
    }
  >({
    mutationKey: ["conversations", "delete"],
    mutationFn: ({ id }) => deleteConversation({ id }),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: conversationsKeys.lists() })
      await qc.cancelQueries({
        queryKey: conversationsKeys.detail(id),
      })
      const previousLists = qc.getQueriesData<ConversationListResponse>({
        queryKey: conversationsKeys.lists(),
      })
      const previousDetail = qc.getQueryData<Conversation>(
        conversationsKeys.detail(id),
      )
      qc.setQueriesData<ConversationListResponse>(
        { queryKey: conversationsKeys.lists() },
        (prev) => {
          if (!prev) return prev
          return {
            ...prev,
            items: prev.items.filter((c) => c.id !== id),
            total: Math.max(0, prev.total - 1),
          }
        },
      )
      qc.removeQueries({ queryKey: conversationsKeys.detail(id) })
      return { previousLists, previousDetail }
    },
    onError: (_err, { id }, context) => {
      if (!context) return
      for (const [key, data] of context.previousLists) {
        qc.setQueryData(key, data)
      }
      if (context.previousDetail !== undefined) {
        qc.setQueryData(conversationsKeys.detail(id), context.previousDetail)
      }
    },
    // No `onSuccess` needed: the optimistic
    // removal in `onMutate` IS the final state
    // (the server has confirmed the row is gone).
  })
}

/** Hook to read the current user's role. */
export type UserRoleForPermissions = "owner" | "admin" | "member" | "viewer"
