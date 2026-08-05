/**
 * Motion — unit tests.
 *
 * F1 Part 4 (Task 33).
 */

import { describe, expect, it } from "vitest"

import {
  ICON_ACTIONS,
  ICON_AGENTS,
  ICON_CATEGORIES,
  ICON_DOCUMENTS,
  ICON_NAVIGATION,
  ICON_SETTINGS,
  ICON_STATUS,
  iconCategory,
} from "../icons/categories"
import {
  DURATION,
  EASE,
  fade,
  fadeFast,
  fadeIn,
  fadeOut,
  fadeSlow,
  page,
  pageStage,
  pageSubtle,
  pageThreshold,
  popIn,
  scaleIn,
  scaleOut,
  slide,
  slideInFromBottom,
  slideInFromLeft,
  slideInFromRight,
  slideInFromTop,
  slideOutToBottom,
  slideOutToLeft,
  slideOutToRight,
  slideOutToTop,
  stagger,
  staggerFast,
  staggerItem,
  staggerSlow,
} from "./index"

describe("Duration tokens", () => {
  it("exposes the four canonical durations", () => {
    expect(DURATION.fast).toBe(150)
    expect(DURATION.base).toBe(250)
    expect(DURATION.slow).toBe(400)
    expect(DURATION.stage).toBe(1400)
  })

  it("exposes two easing curves", () => {
    expect(EASE.outQuint).toEqual([0.22, 1, 0.36, 1])
    expect(EASE.inOutQuart).toEqual([0.76, 0, 0.24, 1])
  })
})

describe("Fade presets", () => {
  it("fade uses base timing + outQuint ease", () => {
    expect(fade.durationMs).toBe(DURATION.base)
    expect(fade.ease).toEqual(EASE.outQuint)
    expect(fade.className).toMatch(/duration-base/)
  })
  it("fadeIn / fadeOut / fadeFast / fadeSlow have distinct timings", () => {
    expect(fadeIn.durationMs).toBe(DURATION.base)
    expect(fadeOut.durationMs).toBe(DURATION.base)
    expect(fadeFast.durationMs).toBe(DURATION.fast)
    expect(fadeSlow.durationMs).toBe(DURATION.slow)
  })
  it("every fade preset has a className that includes `duration-`", () => {
    for (const p of [fade, fadeIn, fadeOut, fadeFast, fadeSlow]) {
      expect(p.className).toMatch(/^animate-(fade|fade-in|fade-out) duration-/)
    }
  })
})

describe("Slide presets", () => {
  it("exposes 4 in / 4 out origins", () => {
    expect(slideInFromTop.origin).toBe("top")
    expect(slideInFromBottom.origin).toBe("bottom")
    expect(slideInFromLeft.origin).toBe("left")
    expect(slideInFromRight.origin).toBe("right")
    expect(slideOutToTop.origin).toBe("top")
    expect(slideOutToBottom.origin).toBe("bottom")
    expect(slideOutToLeft.origin).toBe("left")
    expect(slideOutToRight.origin).toBe("right")
  })
  it("slide className references the origin", () => {
    // The className encodes the origin the element animates in
    // from / out to. Matching the keyframe names in motion.css.
    expect(slideInFromTop.className).toMatch(/slide-in-from-top/)
    expect(slideInFromBottom.className).toMatch(/slide-in-from-bottom/)
    expect(slideInFromLeft.className).toMatch(/slide-in-from-left/)
    expect(slideInFromRight.className).toMatch(/slide-in-from-right/)
    expect(slideOutToLeft.className).toMatch(/slide-out-to-left/)
    expect(slideOutToRight.className).toMatch(/slide-out-to-right/)
  })
  it("slide map exposes every origin", () => {
    expect(slide.from.top).toBe(slideInFromTop)
    expect(slide.from.bottom).toBe(slideInFromBottom)
    expect(slide.from.left).toBe(slideInFromLeft)
    expect(slide.from.right).toBe(slideInFromRight)
    expect(slide.to.top).toBe(slideOutToTop)
    expect(slide.to.bottom).toBe(slideOutToBottom)
    expect(slide.to.left).toBe(slideOutToLeft)
    expect(slide.to.right).toBe(slideOutToRight)
  })
})

describe("Scale presets", () => {
  it("scaleIn / scaleOut share base timing", () => {
    expect(scaleIn.durationMs).toBe(DURATION.base)
    expect(scaleOut.durationMs).toBe(DURATION.base)
  })
  it("popIn is slower (the punchy entrance)", () => {
    expect(popIn.durationMs).toBe(DURATION.slow)
  })
})

describe("Stagger presets", () => {
  it("every preset has a step + initial + child duration", () => {
    expect(staggerFast.stepMs).toBe(40)
    expect(stagger.stepMs).toBe(80)
    expect(staggerSlow.stepMs).toBe(140)
  })
  it("staggerItem returns the right delay + className", () => {
    const result = staggerItem(2, stagger)
    expect(result.style.animationDelay).toBe("160ms") // 0 + 2*80
    expect(result.className).toBe("animate-fade-in")
  })
  it("staggerItem defaults to the `stagger` preset", () => {
    const result = staggerItem(3)
    expect(result.style.animationDelay).toBe("240ms")
  })
})

describe("Page presets", () => {
  it("subtle is the default cross-fade", () => {
    expect(pageSubtle.className).toMatch(/page-subtle/)
    expect(pageSubtle.durationMs).toBe(DURATION.base)
  })
  it("threshold is the Stage 4 light → dark transition", () => {
    expect(pageThreshold.className).toMatch(/page-threshold/)
    expect(pageThreshold.durationMs).toBe(DURATION.slow)
  })
  it("stage is the marketing hero", () => {
    expect(pageStage.durationMs).toBe(DURATION.stage)
  })
  it("page map exposes every preset", () => {
    expect(page.subtle).toBe(pageSubtle)
    expect(page.threshold).toBe(pageThreshold)
    expect(page.stage).toBe(pageStage)
  })
})

describe("Icon categories", () => {
  it("every category list is non-empty", () => {
    expect(ICON_ACTIONS.length).toBeGreaterThan(0)
    expect(ICON_NAVIGATION.length).toBeGreaterThan(0)
    expect(ICON_STATUS.length).toBeGreaterThan(0)
    expect(ICON_DOCUMENTS.length).toBeGreaterThan(0)
    expect(ICON_AGENTS.length).toBeGreaterThan(0)
    expect(ICON_SETTINGS.length).toBeGreaterThan(0)
  })
  it("iconCategory resolves a known icon to its category", () => {
    expect(iconCategory("Plus")).toBe("actions")
    expect(iconCategory("ChevronRight")).toBe("navigation")
    expect(iconCategory("AlertCircle")).toBe("status")
    expect(iconCategory("FileText")).toBe("documents")
    expect(iconCategory("Bot")).toBe("agents")
    expect(iconCategory("SlidersHorizontal")).toBe("settings")
  })
  it("iconCategory returns null for an unknown name", () => {
    expect(iconCategory("NotARealIcon")).toBeNull()
  })
  it("ICON_CATEGORIES map covers every category list", () => {
    expect(ICON_CATEGORIES.actions).toBe(ICON_ACTIONS)
    expect(ICON_CATEGORIES.navigation).toBe(ICON_NAVIGATION)
    expect(ICON_CATEGORIES.status).toBe(ICON_STATUS)
    expect(ICON_CATEGORIES.documents).toBe(ICON_DOCUMENTS)
    expect(ICON_CATEGORIES.agents).toBe(ICON_AGENTS)
    expect(ICON_CATEGORIES.settings).toBe(ICON_SETTINGS)
  })
})
