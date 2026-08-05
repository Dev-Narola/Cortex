/**
 * Slide — translate-from-side presets.
 *
 * **F1 Part 4 (Task 33).** Used by the Drawer (4 sides),
 * DrawerBody, Toast, page transition entrances, and the
 * chat streaming bubble when the first token lands.
 *
 * **Directions.** `up | down | left | right` — each is the
 * **origin** the element slides in from / slides out to.
 * The element's motion is always back to (or away from)
 * its final position, so:
 *   - `slideInFromTop` = the element starts at `top: -X` and
 *     slides DOWN to its position. The className is
 *     `animate-slide-in-from-top` (the origin is the top).
 *
 * **Distance.** Default `--motion-slide-distance: 1rem` is
 * defined in `motion.css`; override per-consumer if needed
 * (`style={{ "--motion-slide-distance": "20vh" }}`).
 */

import { DURATION, EASE } from "./duration"

export type SlideOrigin = "top" | "bottom" | "left" | "right"

export interface SlidePreset {
  /** CSS class to apply. */
  className: string
  /** Duration in ms (for JS consumers). */
  durationMs: number
  /** Cubic-bezier control points (for JS consumers). */
  ease: readonly [number, number, number, number]
  /** Origin the element slides in from / out to. */
  origin: SlideOrigin
}

const slideInClass = (origin: SlideOrigin, speed: keyof typeof DURATION = "base") =>
  `animate-slide-in-from-${origin} duration-${speed}`
const slideOutClass = (origin: SlideOrigin, speed: keyof typeof DURATION = "base") =>
  `animate-slide-out-to-${origin} duration-${speed}`

const build = (
  origin: SlideOrigin,
  kind: "in" | "out" = "in",
  speed: keyof typeof DURATION = "base",
): SlidePreset => ({
  className: (kind === "in" ? slideInClass : slideOutClass)(origin, speed),
  durationMs: DURATION[speed],
  ease: EASE.outQuint,
  origin,
})

export const slideInFromTop = build("top", "in")
export const slideInFromBottom = build("bottom", "in")
export const slideInFromLeft = build("left", "in")
export const slideInFromRight = build("right", "in")
export const slideOutToTop = build("top", "out")
export const slideOutToBottom = build("bottom", "out")
export const slideOutToLeft = build("left", "out")
export const slideOutToRight = build("right", "out")

export const slide = {
  from: {
    top: slideInFromTop,
    bottom: slideInFromBottom,
    left: slideInFromLeft,
    right: slideInFromRight,
  },
  to: {
    top: slideOutToTop,
    bottom: slideOutToBottom,
    left: slideOutToLeft,
    right: slideOutToRight,
  },
} as const
