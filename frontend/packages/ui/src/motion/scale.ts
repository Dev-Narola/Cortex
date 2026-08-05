/**
 * Scale — zoom-in / zoom-out presets.
 *
 * **F1 Part 4 (Task 33).** Used by the Dialog (zoom in on
 * open, zoom out on close), the DropdownMenu content, the
 * Popover content, the Tooltip content.
 *
 * **Variants.**
 *   - `scaleIn` — 95% → 100%, default timing + ease.
 *   - `scaleOut` — 100% → 95%.
 *   - `popIn` — 90% → 100% with a stronger ease for
 *     "punchy" moments (e.g. the first chat token).
 */

import { DURATION, EASE } from "./duration"

export interface ScalePreset {
  className: string
  durationMs: number
  ease: readonly [number, number, number, number]
  /** CSS transform origin. Default `center`. */
  origin?: "center" | "top" | "bottom" | "left" | "right"
}

export const scaleIn: ScalePreset = {
  className: "animate-scale-in duration-base",
  durationMs: DURATION.base,
  ease: EASE.outQuint,
  origin: "center",
}

export const scaleOut: ScalePreset = {
  className: "animate-scale-out duration-base",
  durationMs: DURATION.base,
  ease: EASE.outQuint,
  origin: "center",
}

export const popIn: ScalePreset = {
  className: "animate-pop-in duration-slow",
  durationMs: DURATION.slow,
  ease: EASE.outQuint,
  origin: "center",
}
