/**
 * Stagger — child-list enter presets.
 *
 * **F1 Part 4 (Task 33).** Use for a vertical list of cards
 * (dashboard metrics, search results, agent cards) that
 * should mount in a left-to-right / top-to-bottom cascade
 * rather than all at once.
 *
 * **Mechanism.** Pure CSS: the parent gets the
 * `stagger-children` utility, the children get
 * `animate-fade-in` with an animation-delay driven by
 * `--stagger-index` (set per-child via inline style or the
 * `staggerItem(index)` helper).
 *
 * **Why CSS, not framer-motion.** The auth-app version of
 * stagger is intentionally simple (5 items max, no per-item
 * physics). Richer stagger (orchestrated, spring-based)
 * belongs in apps/web's framer-motion layer.
 */

import { DURATION, EASE } from "./duration"

export interface StaggerPreset {
  /** CSS class on the parent. Children inherit the cascade. */
  parentClassName: string
  /** Base delay between children, ms. */
  stepMs: number
  /** Initial delay before the first child, ms. */
  initialMs: number
  /** Per-child duration, ms. */
  childDurationMs: number
  ease: readonly [number, number, number, number]
}

const build = (
  stepMs: number,
  initialMs = 0,
  childDurationMs: number = DURATION.base,
): StaggerPreset => ({
  parentClassName: "stagger-children",
  stepMs,
  initialMs,
  childDurationMs,
  ease: EASE.outQuint,
})

export const staggerFast = build(40)
export const stagger = build(80)
export const staggerSlow = build(140)

/**
 * Compute the inline `style` object for the Nth child of a
 * stagger list. Apply to each child to drive its delay.
 */
export function staggerItem(
  index: number,
  preset: StaggerPreset = stagger,
): {
  style: { animationDelay: string }
  className: string
} {
  const delayMs = preset.initialMs + index * preset.stepMs
  return {
    style: { animationDelay: `${delayMs}ms` },
    className: "animate-fade-in",
  }
}
