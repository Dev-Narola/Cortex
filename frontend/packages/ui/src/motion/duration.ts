/**
 * Motion — design-system animation tokens.
 *
 * **F1 Part 4 (Task 33).** The motion/ folder centralises every
 * reusable animation preset. Pages and components import these
 * instead of inlining `transition` props or `@keyframes` blocks.
 *
 * **Two layers.**
 *   1. **CSS keyframes** in `motion.css` (side-effect import
 *      via `globals.css`) — the actual keyframe definitions +
 *      the `animate-*` / `duration-*` / `ease-*` Tailwind v4
 *      utilities bound to them.
 *   2. **TypeScript preset modules** (`fade`, `slide`, `scale`,
 *      `stagger`, `page`) — pure data describing the same
 *      presets so a JS consumer (framer-motion, GSAP, etc.)
 *      can read them without the CSS.
 *
 * **The marketing-vs-app rule (UI-UX §6).** The keyframes +
 * presets are intentionally subtle — auth-app usage reads as
 * "fast + calm" by default. Marketing routes may add richer
 * orchestration via GSAP on top; the presets below stay generic.
 *
 * **Honouring `prefers-reduced-motion`.** The CSS keyframes
 * include a `@media (prefers-reduced-motion: reduce)` block that
 * flattens every animation to its end-state instantly. JS
 * consumers should also gate on `usePrefersReducedMotion` (the
 * apps/web hook in `lib/motion/reduced-motion.ts`).
 *
 * **No external dep.** @cortex/ui ships no framer-motion / GSAP.
 * The motion CSS is just a Tailwind v4 `@theme` extension + raw
 * `@keyframes` rules. Heavier orchestration is the app layer's
 * job (apps/web/lib/motion/*).
 */

export const DURATION = {
  fast: 150,
  base: 250,
  slow: 400,
  stage: 1400,
} as const

export const EASE = {
  outQuint: [0.22, 1, 0.36, 1],
  inOutQuart: [0.76, 0, 0.24, 1],
} as const

export type DurationToken = keyof typeof DURATION
export type EaseToken = keyof typeof EASE

export const motionClass = {
  duration: (token: DurationToken) => `duration-${token}`,
  ease: (token: EaseToken) => `ease-${token}`,
} as const
