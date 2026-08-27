/**
 * Marketing animations — GSAP + scroll helpers
 * for the F8 marketing site.
 *
 * **F8 Part 1 + Part 2.** The hero load
 * choreography (~1.4s, GSAP) and the
 * scroll-triggered feature beats (F8 P2
 * onward, GSAP + IntersectionObserver)
 * all flow through this module.
 * Centralising the setup means:
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
 * **Two triggers.**
 *   1. **Mount** — the hero choreography
 *      plays on component mount (the
 *      visitor lands on the page; the
 *      hero reveals).
 *   2. **In view** — the feature beats
 *      (Hybrid Search in P2; Graph,
 *      Agents, Citations in P3) play when
 *      the section scrolls into the
 *      viewport. Each plays **once per
 *      session** (no re-trigger on
 *      scroll-back, per the F8 spec).
 *
 * **Why GSAP for mount, IntersectionObserver
 * for in-view.** GSAP is great for
 * mount-triggered timelines (the hero).
 * For scroll-triggered animations that
 * play once, IntersectionObserver is
 * lighter, native, and doesn't require
 * GSAP's `ScrollTrigger` (which would
 * add a few KB per page). Both end up
 * gated behind the same reduced-motion
 * hook so the behaviour is consistent.
 *
 * **Reduced motion.** When the user has
 * `prefers-reduced-motion: reduce` set, the
 * mount timeline is bypassed entirely and
 * the in-view animations snap to their
 * final state. F9 owns the application-
 * wide reduced-motion pass; this module
 * lays the wiring so that pass is a
 * one-liner.
 *
 * **F9 Part 1 — hook consolidation.** The
 * `usePrefersReducedMotion` hook used to
 * be a `useState` + `useEffect`
 * implementation local to this file. The
 * canonical implementation in
 * `apps/web/lib/motion/reduced-motion.ts`
 * uses `useSyncExternalStore` (the React-
 * recommended pattern for external
 * stores) and is the single source of
 * truth. This file re-exports it for
 * backwards compatibility with the
 * marketing code that imports it from
 * here.
 */

"use client"

import { type RefObject, useEffect } from "react"

import { usePrefersReducedMotion } from "@/lib/motion/reduced-motion"

// Re-export the canonical hook so
// marketing code keeps importing it
// from the same place.
export { usePrefersReducedMotion }

/**
 * useInView — fires `onEnter` once when the
 * referenced element first enters the
 * viewport.
 *
 * **Plays once per session.** Per the F8
 * spec: "Each plays once per session, no
 * re-triggering on scroll-back." The hook
 * unobserves the element after the first
 * intersection event so the animation
 * never replays.
 *
 * **Reduced motion.** When
 * `prefers-reduced-motion: reduce` is
 * set, `onEnter` fires immediately (on
 * mount) so the visual lands in its
 * final state without the scroll trigger
 * — the animation is purely progressive
 * enhancement.
 *
 * **SSR-safe.** The server render is
 * always the "idle" state. The observer
 * only attaches after hydration.
 */
export function useInView(
  ref: RefObject<Element | null>,
  onEnter: () => void,
  options?: { rootMargin?: string; threshold?: number },
): void {
  const reducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    // Reduced motion → call the callback
    // once on mount and skip the observer.
    if (reducedMotion) {
      onEnter()
      return
    }
    const el = ref.current
    if (!el) return
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      // Browsers without IO support get
      // the animation immediately (the
      // visual lands in its final state).
      onEnter()
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            onEnter()
            observer.unobserve(entry.target)
          }
        }
      },
      {
        rootMargin: options?.rootMargin ?? "0px 0px -10% 0px",
        threshold: options?.threshold ?? 0.2,
      },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [onEnter, ref, reducedMotion, options?.rootMargin, options?.threshold])
}

/**
 * Animation vocabulary — single source of
 * truth. Hero + feature beats all use
 * these constants so the page feels like
 * one product.
 */
export const MOTION = {
  /** Hero load choreography (milliseconds). */
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
  /** Section reveal defaults (milliseconds). */
  section: {
    /** Single-section fade-up. */
    fadeUpMs: 600,
    /** Hybrid Search sub-stage windows
     *  (the merge animation timeline). */
    hybridSearch: {
      keywordAppearStartMs: 0,
      keywordAppearEndMs: 400,
      semanticAppearStartMs: 250,
      semanticAppearEndMs: 650,
      mergeStartMs: 600,
      mergeEndMs: 1100,
      fusedAppearStartMs: 1000,
      fusedAppearEndMs: 1350,
      rerankSettleStartMs: 1250,
      rerankSettleEndMs: 1600,
    },
  },
} as const
