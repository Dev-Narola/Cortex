/**
 * GraphCapability — viewport + device capability detection.
 *
 * **F9 Part 2.** The Knowledge Graph Explorer renders either a
 * 3D canvas (R3F + Three.js + WebGL) or a 2D SVG-based fallback
 * (no R3F, no WebGL). The decision is made by `useGraphCapability()`,
 * which combines three signals:
 *
 *   1. **Viewport size** — the dominant signal. A 320px mobile
 *      viewport cannot meaningfully host a 3D orbit interaction.
 *   2. **Reduced motion** — the user has explicitly requested
 *      reduced motion. A 3D scene with continuous camera
 *      interactions (damping) is exactly the kind of "decorative
 *      motion" the spec asks us to honour. Fall back to 2D.
 *   3. **Device concurrency** — a coarse GPU/CPU heuristic.
 *      Devices with 2 or fewer hardware threads often run the
 *      WebGL stack at <10 fps. Fall back to 2D.
 *
 * **Why a hook, not a media query.** The R3F canvas only imports
 * `three` and `@react-three/fiber` (~600KB gzipped). The 2D
 * fallback only imports SVGs from the existing design system.
 * Hooking the decision off `useMediaQuery` would force every
 * client (desktop and mobile) to download the 3D bundle and pay
 * the parse cost. The hook lets the explorer lazy-load the 3D
 * canvas on capable devices and the 2D canvas on the rest.
 *
 * **SSR-safe.** Returns `null` until the first client effect runs
 * (the actual value depends on the viewport, which the server
 * can't know). Consumers should treat `null` as "render the SSR
 * shell, then re-render once the hook resolves".
 *
 * **Deterministic for tests.** The hook reads from a small
 * `ReadonlyArray<Signal>` so a test can inject a known
 * `window.matchMedia` + a known `navigator.hardwareConcurrency`
 * and assert the decision. See `graph-capability.test.tsx`.
 */

import { useEffect, useState } from "react"

import { usePrefersReducedMotion } from "@/lib/motion/reduced-motion"

/**
 * The resolved capability the explorer renders against.
 *
 *   - `"3d"`     — render the R3F canvas
 *   - `"2d"`     — render the SVG fallback
 *   - `"unknown"` — still resolving; render the SSR shell
 */
export type GraphCapability = "3d" | "2d" | "unknown"

/**
 * The width (in CSS pixels) below which the 2D fallback is
 * always used. The 768px threshold matches the project's `md`
 * breakpoint (the natural tablet-vs-mobile boundary).
 *
 * Below this, the 3D canvas's per-frame pixel cost is too
 * high for the GPU budget of a typical mobile device, and
 * the orbit interaction model doesn't translate to a
 * 360px-wide touch surface.
 */
export const GRAPH_2D_VIEWPORT_THRESHOLD_PX = 768

/**
 * The hardware concurrency floor. Devices with fewer
 * hardware threads often run the WebGL stack at <10 fps;
 * falling back to 2D preserves usability.
 *
 * `2` is a conservative floor — most modern phones have
 * 4+ cores. The threshold catches the lowest-end devices
 * without accidentally demoting mid-range hardware.
 */
export const GRAPH_2D_CONCURRENCY_THRESHOLD = 2

// Removed the local `NavigatorWithConcurrency`
// extension — `navigator.hardwareConcurrency` is
// part of the standard `Navigator` type in modern
// TS lib.dom.d.ts (4.4+). The runtime narrowing in
// `readHardwareConcurrency()` handles the old-
// browser case.

function readViewportWidth(): number | null {
  if (typeof window === "undefined") return null
  return window.innerWidth
}

function readHardwareConcurrency(): number | null {
  if (typeof navigator === "undefined") return null
  // `navigator.hardwareConcurrency` is part
  // of the standard Navigator type in
  // modern TS lib.dom.d.ts. We narrow it
  // here to handle the very-old-browser
  // case where the property is missing
  // or non-numeric.
  const c = navigator.hardwareConcurrency
  return typeof c === "number" && Number.isFinite(c) ? c : null
}

/**
 * The pure decision function — exported for tests + for
 * the explorer to call deterministically (e.g. on the
 * first render with a known viewport + concurrency).
 */
export function resolveGraphCapability(args: {
  viewportWidth: number | null
  hardwareConcurrency: number | null
  prefersReducedMotion: boolean
}): GraphCapability {
  // 1. Viewport below threshold → 2D.
  if (args.viewportWidth !== null && args.viewportWidth < GRAPH_2D_VIEWPORT_THRESHOLD_PX) {
    return "2d"
  }
  // 2. Reduced motion → 2D. The 3D scene's
  //    continuous camera-damping is the
  //    kind of decorative motion the
  //    user has asked us to drop.
  if (args.prefersReducedMotion) {
    return "2d"
  }
  // 3. Coarse GPU heuristic: too few cores
  //    → 2D. A `null` concurrency (older
  //    browsers) is treated as "unknown"
  //    and we let the viewport / motion
  //    signals decide.
  if (
    args.hardwareConcurrency !== null &&
    args.hardwareConcurrency < GRAPH_2D_CONCURRENCY_THRESHOLD
  ) {
    return "2d"
  }
  // Capable desktop-class device → 3D.
  return "3d"
}

/**
 * The hook the explorer calls. Resolves to `"3d"` or `"2d"`
 * after the first client effect. Resolves to `"unknown"` on
 * the server (and on the very first client render before
 * `useEffect` has run).
 */
export function useGraphCapability(): GraphCapability {
  const reducedMotion = usePrefersReducedMotion()
  const [viewportWidth, setViewportWidth] = useState<number | null>(null)
  const [hardwareConcurrency, setHardwareConcurrency] = useState<number | null>(null)

  useEffect(() => {
    setViewportWidth(readViewportWidth())
    setHardwareConcurrency(readHardwareConcurrency())

    if (typeof window === "undefined") return
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  if (viewportWidth === null) return "unknown"
  return resolveGraphCapability({
    viewportWidth,
    hardwareConcurrency,
    prefersReducedMotion: reducedMotion,
  })
}
