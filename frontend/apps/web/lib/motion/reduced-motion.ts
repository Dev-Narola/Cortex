/**
 * `prefersReducedMotion` — React hook that subscribes to the
 * user's motion preference.
 *
 * The V9 UX doc requires the graph explorer and the theme
 * transition to honour this. Components that gate animations
 * should use this hook and read the boolean synchronously.
 */

"use client"

import { useSyncExternalStore } from "react"

const QUERY = "(prefers-reduced-motion: reduce)"

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {}
  const mql = window.matchMedia(QUERY)
  mql.addEventListener("change", callback)
  return () => mql.removeEventListener("change", callback)
}

function getSnapshot() {
  if (typeof window === "undefined") return false
  return window.matchMedia(QUERY).matches
}

function getServerSnapshot() {
  return false
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
