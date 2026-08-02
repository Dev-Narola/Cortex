/**
 * View Transitions — wraps the theme-switch in
 * `document.startViewTransition` so the light↔dark morph is
 * native + GPU-accelerated.
 *
 * Browsers without the API get a no-op fallback (the theme just
 * switches instantly). Honours `prefers-reduced-motion` by
 * skipping the transition.
 */

"use client";

import { useTheme } from "next-themes";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface ViewTransitionsContextValue {
  /** Trigger a view transition (used internally by the theme). */
  startViewTransition: (callback: () => void | Promise<void>) => void;
}

const ViewTransitionsContext = createContext<
  ViewTransitionsContextValue | undefined
>(undefined);

export function useViewTransitions() {
  const ctx = useContext(ViewTransitionsContext);
  if (!ctx) {
    throw new Error(
      "useViewTransitions must be used inside <ViewTransitions>",
    );
  }
  return ctx;
}

export function ViewTransitions({ children }: { children: ReactNode }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [supports, setSupports] = useState(false);

  useEffect(() => {
    // Only Chromium + Safari support startViewTransition as of
    // 2026; the cast is safe because we feature-detect below.
    setSupports(typeof document !== "undefined" &&
      "startViewTransition" in document);
  }, []);

  const startViewTransition = useCallback(
    (callback: () => void | Promise<void>) => {
      // Reduced-motion: skip the transition entirely.
      if (typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        callback();
        return;
      }
      // No native support: run the callback synchronously.
      if (!supports || typeof document === "undefined") {
        callback();
        return;
      }
      // V9 Part 3 / Stage 4: the one place the theme itself is
      // allowed to be the animation.
      const transition = document.startViewTransition(async () => {
        await callback();
      });
      // Best-effort: log if the transition is skipped by the
      // browser (e.g. user reduced-motion later in the call).
      transition.ready.catch(() => {});
    },
    [supports],
  );

  // Wrap the theme setter so the toggle is animated.
  const setAnimatedTheme = useCallback(
    (next: "light" | "dark" | "system") => {
      startViewTransition(() => {
        setTheme(next);
      });
    },
    [setTheme, startViewTransition],
  );

  const value = useMemo(
    () => ({ startViewTransition, setAnimatedTheme }),
    [startViewTransition, setAnimatedTheme],
  );

  return (
    <ViewTransitionsContext.Provider value={value}>
      {children}
    </ViewTransitionsContext.Provider>
  );
}
