/**
 * Motion — barrel.
 *
 * Re-exported by `@cortex/ui`; never imported directly by app code.
 *
 * **F1 Part 4 (Task 33).** Pages and components import from
 * `@cortex/ui`'s top-level barrel (which re-exports this folder);
 * never define animations inline.
 *
 * **Modules.**
 *   - `duration` — animation timing tokens (`fast`, `base`,
 *     `slow`, `stage`).
 *   - `fade`     — opacity in/out presets.
 *   - `slide`    — translate-from-side presets.
 *   - `scale`    — zoom in/out presets.
 *   - `stagger`  — child-list cascade presets.
 *   - `page`     — page-level transition presets.
 *
 * **Side-effect import.** `globals.css` already imports the
 * matching `motion.css` so the keyframes are available. App
 * code never needs to import the CSS directly.
 */

export {
  DURATION,
  EASE,
  motionClass,
  type DurationToken,
  type EaseToken,
} from "./duration"

export {
  fade,
  fadeFast,
  fadeIn,
  fadeOut,
  fadeSlow,
  type FadePreset,
} from "./fade"

export {
  slide,
  slideInFromBottom,
  slideInFromLeft,
  slideInFromRight,
  slideInFromTop,
  slideOutToBottom,
  slideOutToLeft,
  slideOutToRight,
  slideOutToTop,
  type SlideOrigin,
  type SlidePreset,
} from "./slide"

export {
  popIn,
  scaleIn,
  scaleOut,
  type ScalePreset,
} from "./scale"

export {
  stagger,
  staggerFast,
  staggerItem,
  staggerSlow,
  type StaggerPreset,
} from "./stagger"

export {
  page,
  pageStage,
  pageSubtle,
  pageThreshold,
  type PagePreset,
} from "./page"
