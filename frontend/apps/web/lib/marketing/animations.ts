/**
 * Marketing animations — GSAP helpers for the
 * F8 marketing site.
 *
 * **F8 Part 1.** The hero load choreography
 * (~1.4s) and the future scroll-driven
 * feature beats all flow through this
 * module. Centralising the GSAP setup
 * means:
 *
 *   - There's one place to honour
 *     `prefers-reduced-motion` (the spec
 *     explicitly says F8 must lay the
 *     foundation for F9's full reduced-
 *     motion pass).
 *   - There's one place to gate client-only
 *     GSAP behind `useEffect` (the
 *     `window` access is server-unsafe).
 *   - The animation vocabulary is shared
 *     (durations, easings, stagger values)
 *     so the hero's "0.3–0.9s headline
 *     reveal" and a later feature's
 *     "graph nodes form" feel like one
 *     product, not five.
 *
 * **Why GSAP, not Framer Motion.** The
 * spec recommends GSAP for F8 because the
 * scroll choreography (Parts 2–6) needs
 * `ScrollTrigger`, which is the most
 * mature scroll-tied timeline system. Both
 * libraries are installed; the marketing
 * site is the GSAP surface. The F6 KG
 * Explorer stays on R3F; the app shell
 * doesn't use either.
 *
 * **The hero timeline.** A 1.4-second
 * sequence:
 *
 *   0.00–0.40s  Ambient node field appears
 *   0.30–0.90s  Headline reveals word-by-word
 *   0.60–1.00s  Subheadline fades upward
 *   0.90–1.20s  CTA appears
 *   1.20s+      Hero visual enters idle loop
 *
 * **Reduced motion.** When the user has
 * `prefers-reduced-motion: reduce` set, the
 * timeline is bypassed entirely. The hero
 * renders in its final state immediately.
 * F9 will perform the full application-wide
 * pass; this module lays the wiring so the
 * later pass is a one-liner.
 */

"use client"

import { useEffect, useState } from "react"

/**
 * `prefers-reduced-motion` as a React hook.
 *
 * Returns `true` when the user has
 * `prefers-reduced-motion: reduce` set in
 * their OS settings. Defaults to `false` on
 * the server (the hero is server-rendered;
 * the first paint must look correct, so we
 * assume the *full* motion on the server
 * and refine on the client).
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)")
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches)
    setReduced(mql.matches)
    // Modern + Safari < 14 fallback.
    if (mql.addEventListener) {
      mql.addEventListener("change", handler)
      return () => mql.removeEventListener("change", handler)
    }
    mql.addListener(handler)
    return () => mql.removeListener(handler)
  }, [])
  return reduced
}

/**
 * Animation vocabulary — single source of
 * truth. Hero + future feature beats all
 * use these constants so the page feels
 * like one product.
 */
export const MOTION = {
  /** Hero load choreography (seconds). */
  hero: {
    /** The whole timeline. */
    totalMs: 1400,
    /** Ambient field appears. */
    ambientStartMs: 0,
    ambientEndMs: 400,
    /** Headline word reveal window. */
    headlineStartMs: 300,
    headlineEndMs: 900,
    /** Subheadline fade-up. */
    subheadlineStartMs: 600,
    subheadlineEndMs: 1000,
    /** CTA reveals. */
    ctaStartMs: 900,
    ctaEndMs: 1200,
  },
  /** Stagger between consecutive words in the headline. */
  headlineStaggerMs: 60,
  /** Easing vocabulary (CSS-compatible curves). */
  easing: {
    /** "Snappy but soft" — used for hero reveals. */
    out: "power3.out",
    /** "Weight" — used for the ambient field + idle motion. */
    inOut: "power2.inOut",
  },
} as const
