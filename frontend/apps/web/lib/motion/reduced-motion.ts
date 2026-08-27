/**
 * `prefersReducedMotion` — React hook that subscribes to the
 * user's motion preference.
 *
 * The V9 UX doc requires the graph explorer and the theme
 * transition to honour this. Components that gate animations
 * should use this hook and read the boolean synchronously.
 *
 * **F9 Part 1 — canonical hook.** This is the single source of
 * truth for `prefers-reduced-motion` across the marketing site
 * (re-exported by `lib/marketing/animations`), the graph
 * canvas, the theme view-transition, and any future consumer.
 * Three pre-F9 duplicates were collapsed onto this one.
 *
 * **SSR-safe.** `getServerSnapshot` returns `false` so the
 * server render always assumes "full motion" and the client
 * effect refines to the real preference after hydration.
 *
 * **Safe in environments without `matchMedia`.** Some legacy
 * test envs + the rare old browser don't implement
 * `window.matchMedia`. The `subscribe` + `getSnapshot` helpers
 * fall back to no-op / `false` so the hook never throws.
 */

"use client"

import { useSyncExternalStore } from "react"

const QUERY = "(prefers-reduced-motion: reduce)"

function subscribe(callback: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) {
    return () => {}
  }
  const mql = window.matchMedia(QUERY)
  if (typeof mql.addEventListener !== "function") {
    return () => {}
  }
  mql.addEventListener("change", callback)
  return () => mql.removeEventListener("change", callback)
}

function getSnapshot() {
  if (typeof window === "undefined" || !window.matchMedia) return false
  return window.matchMedia(QUERY).matches
}

function getServerSnapshot() {
  return false
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
