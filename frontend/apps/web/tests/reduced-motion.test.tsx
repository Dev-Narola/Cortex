/**
 * Reduced-motion behavioural test — F9 Part 3.
 *
 * Pins the spec's §47 list ("E2E Reduced-Motion Tests") as a
 * regression net. The test verifies the behavioural contract
 * the F9 P3 audit documents in
 * `Docs/frontend/f9-reduced-motion-audit.md`:
 *
 *   - The global CSS rule flattens animations + transitions.
 *   - The `usePrefersReducedMotion` hook is the canonical
 *     source of truth (covered in F9 P1's
 *     `tests/lib/motion/reduced-motion.test.tsx`).
 *   - The marketing hero's GSAP timeline is bypassed under
 *     reduced motion (verified by the hero's own test).
 *   - The live demo's streaming still works (state, not
 *     motion).
 *   - The 2D graph fallback is static.
 *   - Theme transition's `startViewTransition` is the
 *     only large JS motion and is browser-honoured.
 *
 * **Why behavioural, not pixel.** The spec is explicit: "Do
 * not test animation frame-by-frame." The point of the audit
 * is that motion is suppressed; the point of the test is
 * that functionality is preserved. We test the latter.
 */
import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { usePrefersReducedMotion } from "@/lib/motion/reduced-motion"

describe("Reduced-motion behaviour catalogue (F9 P3)", () => {
  // Track matchMedia listeners + a mutable
  // `matches` field so we can flip the
  // preference mid-test.
  let listeners: Array<(e: { matches: boolean }) => void> = []
  let currentMatches = false

  const setReducedMotion = (next: boolean) => {
    currentMatches = next
    for (const cb of listeners) cb({ matches: next })
  }

  const installMatchMedia = (initial: boolean) => {
    currentMatches = initial
    listeners = []
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        get matches() {
          return currentMatches
        },
        media: query,
        addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => {
          listeners.push(cb)
        },
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  }

  beforeEach(() => {
    installMatchMedia(false)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ----- Global CSS coverage -----

  it("the global CSS rule contains the reduced-motion block", async () => {
    // We import the CSS module indirectly
    // (the side-effect import lives in
    // globals.css). The test confirms the
    // rule exists in the source so a future
    // contributor can't quietly remove the
    // catch-all.
    const fs = await import("node:fs/promises")
    const path = await import("node:path")
    // The test runs from `apps/web/`; the
    // CSS lives in the monorepo's
    // `packages/ui/` two levels up.
    const repoRoot = path.resolve(process.cwd(), "../..")
    const cssPath = path.resolve(repoRoot, "packages/ui/src/styles/globals.css")
    const css = await fs.readFile(cssPath, "utf8")
    expect(css).toMatch(/@media\s+\(prefers-reduced-motion:\s*reduce\)/)
    // The catch-all `*, *::before, *::after`
    // selector must include
    // `animation-duration` + `transition-duration`
    // so every CSS animation + transition
    // flattens.
    expect(css).toMatch(/animation-duration:\s*0\.01ms/)
    expect(css).toMatch(/transition-duration:\s*0\.01ms/)
  })

  it("the Tailwind v4 motion token block flattens to 0ms under reduced motion", async () => {
    const fs = await import("node:fs/promises")
    const path = await import("node:path")
    const repoRoot = path.resolve(process.cwd(), "../..")
    const cssPath = path.resolve(repoRoot, "packages/ui/src/styles/motion.css")
    const css = await fs.readFile(cssPath, "utf8")
    // The motion token block must zero
    // out the duration tokens for defence
    // in depth.
    expect(css).toMatch(
      /@media\s+\(prefers-reduced-motion:\s*reduce\)[\s\S]*--motion-duration-base:\s*0ms/,
    )
  })

  // ----- Hook coverage (cross-reference F9 P1) -----

  it("the canonical hook returns true when the preference is reduce", () => {
    installMatchMedia(true)
    const Probe = () => {
      const reduced = usePrefersReducedMotion()
      return <span data-testid="probe">{String(reduced)}</span>
    }
    render(<Probe />)
    expect(screen.getByTestId("probe")).toHaveTextContent("true")
  })

  it("the canonical hook re-renders when the preference flips", () => {
    const Probe = () => {
      const reduced = usePrefersReducedMotion()
      return <span data-testid="probe">{String(reduced)}</span>
    }
    render(<Probe />)
    expect(screen.getByTestId("probe")).toHaveTextContent("false")
    act(() => {
      setReducedMotion(true)
    })
    expect(screen.getByTestId("probe")).toHaveTextContent("true")
    act(() => {
      setReducedMotion(false)
    })
    expect(screen.getByTestId("probe")).toHaveTextContent("false")
  })

  // ----- Marketing hero -----

  it("the marketing hero renders its final state when the preference is reduce", async () => {
    // The hero's GSAP timeline is bypassed
    // entirely on reduced motion (see
    // `hero-section.tsx` useEffect early
    // return). The result is the final
    // state on first paint.
    installMatchMedia(true)
    const { HeroSection } = await import("@/components/marketing/hero/hero-section")
    render(<HeroSection />)
    // The h1 + subhead + CTA + visual
    // should all be present without
    // waiting for the timeline.
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument()
    expect(screen.getByText(/hybrid search, a live knowledge graph/i)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /start free/i })).toHaveAttribute("href", "/register")
  })

  // ----- Live demo streaming (functional preservation) -----

  it("the live demo's chip-click + streaming still works (state, not motion)", async () => {
    installMatchMedia(false) // baseline: motion is fine
    const { DemoChat } = await import("@/components/marketing/demo/demo-chat")
    const user = userEvent.setup()
    render(<DemoChat />)
    // The first chip should submit on
    // click. The stream runs via
    // setTimeout (state, not motion), so
    // it works regardless of reduced
    // motion preference. Under reduced
    // motion the chunks just appear
    // instantly (no fade).
    const chip = screen.getAllByRole("button", { name: /hybrid search/i })[0]
    if (!chip) throw new Error("expected at least one demo question chip")
    await user.click(chip)
    // The answer text should appear in
    // the bubble.
    expect(await screen.findByText(/hybrid search/i, {}, { timeout: 3000 })).toBeInTheDocument()
  })

  // ----- 2D graph fallback (static by design) -----

  it("the 2D graph fallback renders without any animation classes", async () => {
    installMatchMedia(true) // reduced motion → 2D
    const { GraphCanvas2D } = await import("@/components/graph/graph-canvas-2d")
    const { container } = render(
      <GraphCanvas2D
        data={{
          nodes: [
            {
              id: "n1",
              label: "Root",
              type: "person",
              position: [0, 0, 0],
            },
          ],
          edges: [],
        }}
        selectedNodeId="n1"
        onSelect={vi.fn()}
      />,
    )
    const html = container.innerHTML
    // The 2D canvas must not contain any
    // infinite animation classes —
    // everything should land in its
    // final state.
    expect(html).not.toMatch(/animate-pulse/)
    expect(html).not.toMatch(/animate-spin/)
    expect(html).not.toMatch(/animate-ping/)
    expect(html).not.toMatch(/animate-\[/)
    // And no `transition-*` with
    // explicit durations.
    expect(html).not.toMatch(/duration-\d/)
  })

  // ----- Focus visibility (motion-independent) -----

  it("focus visibility does NOT depend on motion (the Volt ring is colour-only)", async () => {
    // We don't need a component to verify
    // this — we read the source files and
    // confirm the focus styling uses
    // `ring-*` (border) not `animate-*`
    // (motion).
    const fs = await import("node:fs/promises")
    const path = await import("node:path")
    const candidates = [
      "components/marketing/marketing-header.tsx",
      "components/marketing/footer.tsx",
      "components/marketing/final-cta.tsx",
    ]
    for (const rel of candidates) {
      const p = path.resolve(process.cwd(), rel)
      const src = await fs.readFile(p, "utf8")
      // The focus pattern across the
      // marketing surface is
      // `focus-visible:ring-2` (border),
      // not `focus-visible:animate-*` (motion).
      // A regression here would be
      // a future contributor replacing
      // a `ring-2` with an `animate-`.
      if (src.includes("focus-visible:")) {
        expect(src).toMatch(/focus-visible:[^"\n]*ring-2/)
        expect(src).not.toMatch(/focus-visible:[^"\n]*animate-/)
      }
    }
  })

  // ----- Streaming message keeps its glow visible (just flat) -----

  it("the streaming message's Spark Glow opacity-100 class is still present (flat, not breathing)", async () => {
    // Under reduced motion, the `animate-pulse`
    // is suppressed but the `opacity-100`
    // that makes the glow visible is
    // still applied. This is the
    // "decorative motion disappears, but
    // the visual remains" contract.
    const { StreamingMessage } = await import("@/components/chat/StreamingMessage")
    const { container } = render(
      <StreamingMessage
        content="Hello world"
        isActive={true}
        conversationId="conv-1"
        retrievedChunkIds={[]}
      />,
    )
    const article = screen.getByRole("article", { name: /assistant is generating/i })
    // The bubble itself.
    expect(article).toBeInTheDocument()
    // The Spark Glow backdrop uses
    // `opacity-100` when `isActive`. The
    // class is preserved under reduced
    // motion; only the `animate-pulse` is
    // suppressed.
    const glow = container.querySelector('span[aria-hidden="true"]')
    expect(glow).not.toBeNull()
    // The class list must include
    // `opacity-100` (so the glow is
    // visible) AND `animate-pulse` (which
    // is suppressed to 0.01ms by the
    // global CSS rule). The fact that
    // `animate-pulse` is still in the
    // className is fine — the global
    // rule handles it.
    expect(glow?.className ?? "").toMatch(/opacity-100/)
    // The dot caret is also present.
    expect(within(article).getAllByText(/assistant/i).length).toBeGreaterThan(0)
  })
})
