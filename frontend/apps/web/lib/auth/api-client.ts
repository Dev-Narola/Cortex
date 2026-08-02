/**
 * Singleton `ApiClient` wired with the auth store.
 *
 * The token getter reads from the Zustand store; the
 * unauthorized handler triggers a silent refresh and updates
 * the store on success, or returns false (which surfaces the
 * 401 to the caller).
 */

"use client"

import { ApiClient } from "@cortex/api-client"
import { publicEnv } from "@cortex/config"

import { useAuthStore } from "./store"

let cached: ApiClient | null = null

export function getApiClient(): ApiClient {
  if (cached) return cached
  cached = new ApiClient({
    baseUrl: publicEnv.NEXT_PUBLIC_API_URL,
    getAccessToken: () => useAuthStore.getState().accessToken,
    onUnauthorized: async () => {
      // Silent refresh against the backend. The refresh token
      // is in the httpOnly cookie; the browser sends it
      // automatically with `credentials: "include"`.
      try {
        const res = await fetch(`${publicEnv.NEXT_PUBLIC_API_URL}/api/v1/auth/refresh`, {
          method: "POST",
          credentials: "include",
        })
        if (!res.ok) {
          useAuthStore.getState().signOut()
          return false
        }
        const data = (await res.json()) as { access_token: string }
        useAuthStore.getState().setAccessToken(data.access_token)
        return true
      } catch {
        useAuthStore.getState().signOut()
        return false
      }
    },
  })
  return cached
}
