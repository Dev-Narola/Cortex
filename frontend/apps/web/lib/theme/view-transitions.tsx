/**
 * View Transitions — the React layer.
 *
 * Wraps the theme switch in `document.startViewTransition` so the
 * light↔dark morph is native + GPU-accelerated.
 *
 * **F0 scope (Task 45).** This file exists so any component can
 * use the React `<ViewTransitions>` provider; the pure-logic
 * helpers (feature detection, reduced-motion check, the typed
 * `startViewTransition` function) live in `view-transitions.ts`
 * so non-React callers can use them too.
 *
 * **Honours `prefers-reduced-motion` automatically** via the
 * helper in `.ts`. No animation is added on top — F9 will
 * optionally layer a GSAP timeline here.
 */

"use client"

import { useTheme } from "next-themes"
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"

import {
  isViewTransitionSupported,
  startViewTransition as startViewTransitionRaw,
} from "./view-transitions-core"

interface ViewTransitionsContextValue {
  /** Trigger a view transition (used internally by the theme). */
  startViewTransition: (callback: () => void | Promise<void>) => void
  /** Wrap next-themes' `setTheme` in a view transition. */
  setAnimatedTheme: (next: "light" | "dark" | "system") => void
  /** Browser supports the API. False on the server. */
  isSupported: boolean
}

const ViewTransitionsContext = createContext<ViewTransitionsContextValue | undefined>(undefined)

export function useViewTransitions() {
  const ctx = useContext(ViewTransitionsContext)
  if (!ctx) {
    throw new Error("useViewTransitions must be used inside <ViewTransitions>")
  }
  return ctx
}

export function ViewTransitions({ children }: { children: ReactNode }) {
  const { setTheme } = useTheme()
  const [isSupported, setIsSupported] = useState(false)

  useEffect(() => {
    setIsSupported(isViewTransitionSupported())
  }, [])

  const startViewTransition = useCallback((callback: () => void | Promise<void>) => {
    startViewTransitionRaw(callback)
  }, [])

  // Wrap the theme setter so the toggle is animated.
  const setAnimatedTheme = useCallback(
    (next: "light" | "dark" | "system") => {
      startViewTransition(() => {
        setTheme(next)
      })
    },
    [setTheme, startViewTransition],
  )

  const value = useMemo(
    () => ({ startViewTransition, setAnimatedTheme, isSupported }),
    [startViewTransition, setAnimatedTheme, isSupported],
  )

  return <ViewTransitionsContext.Provider value={value}>{children}</ViewTransitionsContext.Provider>
}
