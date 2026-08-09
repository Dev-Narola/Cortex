/**
 * useClipboard — a tiny, SSR-safe clipboard
 * helper.
 *
 * **F4 Part 4 (Tasks 78-80).** Wraps
 * `navigator.clipboard.writeText` with:
 *
 *   - SSR safety (no-op outside the browser).
 *   - A testable return value: `{ state, error }`.
 *     `state` is `"idle" | "success" | "error"` so
 *     the UI can switch on it without storing
 *     booleans.
 *   - A `copy()` callback that re-uses the same
 *     instance, so multiple calls in a row don't
 *     create a new `navigator.clipboard` lookup.
 *   - Optional `reset()` to drop back to `"idle"`
 *     (e.g. when the component unmounts).
 *
 * **Why not a third-party lib.** The spec is
 * "navigator.clipboard.writeText + a small state
 * machine". Anything bigger would be over-engineering.
 *
 * **The fallback.** If the browser doesn't support
 * `navigator.clipboard.writeText` (older Safari,
 * embedded webviews, etc.), we return
 * `{ state: "error", error: new Error("...") }` —
 * the UI then offers the user the `content` in a
 * `<textarea readOnly>` to copy manually. This
 * matches the "do not silently fail" engineering
 * convention.
 */

"use client"

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"

export type ClipboardState = "idle" | "success" | "error"

export interface UseClipboardResult {
  state: ClipboardState
  error: Error | null
  copy: (text: string) => Promise<void>
  reset: () => void
}

export function useClipboard(): UseClipboardResult {
  const [state, setState] = useState<ClipboardState>("idle")
  const [error, setError] = useState<Error | null>(null)
  // Hold a ref to the latest state so the timeout
  // (below) can read it without re-creating the
  // callback on every render.
  const stateRef = useRef<ClipboardState>("idle")
  stateRef.current = state

  const copy = useCallback(async (text: string) => {
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      const e = new Error("Clipboard is not available in this environment.")
      setState("error")
      setError(e)
      return
    }
    const api = navigator.clipboard
    if (!api || typeof api.writeText !== "function") {
      const e = new Error(
        "Your browser does not support clipboard access. Select the text manually.",
      )
      setState("error")
      setError(e)
      return
    }
    try {
      await api.writeText(text)
      setState("success")
      setError(null)
    } catch (err) {
      setState("error")
      setError(
        err instanceof Error
          ? err
          : new Error("Failed to write to the clipboard."),
      )
    }
  }, [])

  const reset = useCallback(() => {
    setState("idle")
    setError(null)
  }, [])

  // Auto-clear the success / error state after a
  // short window so the UI doesn't get stuck on a
  // stale pill if the user navigates away from the
  // bubble.
  useEffect(() => {
    if (state === "idle") return
    const id = setTimeout(() => {
      // Only reset if we're still in the same
      // state we set the timer in (don't override
      // a newer state transition).
      if (stateRef.current === state) {
        setState("idle")
        setError(null)
      }
    }, 1500)
    return () => clearTimeout(id)
  }, [state])

  return { state, error, copy, reset }
}
