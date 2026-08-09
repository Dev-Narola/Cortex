/**
 * Rate limit store — module-level Zustand for the
 * single "we're being throttled" banner the entire
 * (app) shell shares.
 *
 * **F4 Part 4 (Task 97).** The UI/UX specifies a
 * top-of-viewport, error-tinted Slate banner that
 * persists until dismissed or the period resets.
 * "Don't create a Chat-specific rate-limit
 * visual" — the same banner is shared across
 * every authenticated screen.
 *
 * **State shape.**
 *   - `message: string | null` — null = hidden.
 *   - `retryAfterMs: number | null` — when the
 *     server told us to come back (the
 *     `Retry-After` header). The banner uses this
 *     to render a "Try again in 30s" countdown.
 *   - `until: number | null` — epoch ms when the
 *     banner auto-hides. `null` = manual dismiss
 *     only.
 *
 * **Multiple sources.** The store is module-level
 * (not React context) so any layer (the API
 * client interceptor, a chat mutation, an
 * ingestion call) can call `setRateLimit(...)`
 * without prop-drilling. The banner is a single
 * subscriber that re-renders on changes.
 *
 * **Why not TanStack Query.** Rate-limit state
 * is ephemeral UI state, not cached server data.
 * The spec routes local UI state through Zustand
 * and server data through TanStack Query.
 */

"use client"

import { create } from "zustand"

export interface RateLimitState {
  message: string | null
  retryAfterMs: number | null
  until: number | null
  setRateLimit: (input: {
    message?: string
    retryAfterMs?: number | null
  }) => void
  dismiss: () => void
  reset: () => void
}

export const useRateLimitStore = create<RateLimitState>((set) => ({
  message: null,
  retryAfterMs: null,
  until: null,
  setRateLimit: ({ message, retryAfterMs }) => {
    const until =
      typeof retryAfterMs === "number" && retryAfterMs > 0
        ? Date.now() + retryAfterMs
        : null
    set({
      message: message ?? "Too many requests. Please slow down.",
      retryAfterMs: retryAfterMs ?? null,
      until,
    })
  },
  dismiss: () => set({ message: null, retryAfterMs: null, until: null }),
  reset: () => set({ message: null, retryAfterMs: null, until: null }),
}))

export const rateLimitStore = {
  set: (input: { message?: string; retryAfterMs?: number | null }) =>
    useRateLimitStore.getState().setRateLimit(input),
  dismiss: () => useRateLimitStore.getState().dismiss(),
  reset: () => useRateLimitStore.getState().reset(),
}
