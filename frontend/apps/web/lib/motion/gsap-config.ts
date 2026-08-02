/**
 * GSAP configuration — marketing-only animation helper.
 *
 * V9 Frontend: GSAP is loaded **only** in the (marketing)
 * route group via dynamic import. The in-app routes use
 * Framer Motion instead. This split keeps both bundles
 * small (Next.js code-splits by route).
 *
 * If `prefers-reduced-motion` is on, the helpers no-op
 * without throwing.
 */

"use client";

import { useEffect } from "react";

import { usePrefersReducedMotion } from "../motion/reduced-motion";

/**
 * Helper: import GSAP lazily. Returns the module once it has
 * loaded; subsequent calls return the cached module.
 */
let cached: Promise<typeof import("gsap")> | null = null;
export function loadGsap() {
  if (!cached) cached = import("gsap");
  return cached;
}

/**
 * Component: mounts a GSAP timeline scoped to the marketing
 * route group. Honours `prefers-reduced-motion` by skipping
 * the timeline entirely.
 */
export function GsapTimeline({
  setup,
  deps = [],
}: {
  setup: (gsap: typeof import("gsap")) => void | (() => void);
  deps?: ReadonlyArray<unknown>;
}) {
  const reduce = usePrefersReducedMotion();
  useEffect(() => {
    if (reduce) return;
    let cleanup: (() => void) | undefined;
    loadGsap().then((gsap) => {
      const ret = setup(gsap);
      if (typeof ret === "function") cleanup = ret;
    });
    return () => cleanup?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce, ...deps]);
  return null;
}
