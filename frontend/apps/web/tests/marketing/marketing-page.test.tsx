/**
 * Marketing page integration — F8 final
 * composition.
 *
 * Tests the complete F8 story *order* on
 * the public marketing page:
 *
 *   1. Hero
 *   2. Problem
 *   3. Solution
 *   4. Hybrid Search
 *   5. Knowledge Graph
 *   6. Agents + MCP
 *   7. Citations
 *   8. Live Demo
 *   9. Technical Credibility
 *  10. Final CTA
 *  11. Footer
 *
 * The order is the narrative — F8 isn't
 * just "build a set of marketing
 * components", it's "compose the story
 * so the visitor gets the
 * proof → close sequence right". This
 * test is the regression net for that.
 *
 * **Test strategy.** The page is a
 * server component (it reads the
 * `cortex_auth_hint` cookie and may
 * redirect). We mock `next/headers` to
 * return a no-auth cookie, mock
 * `next/navigation` so `redirect()`
 * doesn't actually navigate, then
 * render the page and assert that all
 * the documented sections appear in
 * order via their `data-testid` /
 * role / heading markers.
 *
 * **Auth redirect.** We also assert
 * that with the auth hint present, the
 * page redirects (the production
 * behavior, not a test-only path).
 */
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

// GSAP is a client-only dependency; mock
// it so the marketing page can import
// the HeroSection + its GSAP timeline
// without pulling the real GSAP bundle.
vi.mock("gsap", () => ({
  gsap: {
    timeline: () => ({
      fromTo: vi.fn().mockReturnThis(),
    }),
  },
}))

// next/headers — control the auth hint
// cookie. The default is "no auth" so
// the page renders normally.
const cookieStore: { get: (name: string) => { value: string } | undefined } = {
  get: () => undefined,
}
vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => cookieStore.get(name),
    }),
}))

// next/navigation — capture `redirect`
// calls so the page-internal redirect
// doesn't crash the test.
const redirectMock = vi.fn((url: string) => {
  throw new Error(`__redirect:${url}`)
})
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}))

import LandingPage from "@/app/(marketing)/page"

describe("Marketing page — F8 final composition", () => {
  it("renders the complete F8 story in the documented order", async () => {
    const { container } = render(await LandingPage())

    // 1. Hero — the only h1 on the page.
    const h1 = screen.getByRole("heading", { level: 1 })
    expect(h1).toHaveTextContent(/scattered/i)

    // 2. Problem — eyebrow "the problem".
    expect(screen.getByText(/the problem/i)).toBeInTheDocument()
    // 3. Solution — eyebrow "the solution".
    expect(screen.getByText(/the solution/i)).toBeInTheDocument()
    // 4. Hybrid Search — id #hybrid-search.
    expect(container.querySelector("section#hybrid-search")).toBeInTheDocument()
    // 5. Knowledge Graph — id #knowledge-graph.
    expect(container.querySelector("section#knowledge-graph")).toBeInTheDocument()
    // 6. Agents + MCP — id #agents.
    expect(container.querySelector("section#agents")).toBeInTheDocument()
    // 7. Citations — id #citations.
    expect(container.querySelector("section#citations")).toBeInTheDocument()
    // 8. Live Demo — id #demo.
    expect(container.querySelector("section#demo")).toBeInTheDocument()
    // 9. Technical Credibility — testid.
    expect(screen.getByTestId("technical-credibility")).toBeInTheDocument()
    // 10. Final CTA — testid.
    expect(screen.getByTestId("final-cta")).toBeInTheDocument()
    // 11. Footer — testid.
    expect(screen.getByTestId("marketing-footer")).toBeInTheDocument()
  })

  it("renders the F8 sections in the exact narrative order", async () => {
    // The narrative is a story. The order
    // matters: the proof → close
    // sequence is the whole point of F8.
    // We assert position by collecting
    // the major section landmarks in
    // document order and comparing the
    // resulting identity list.
    const { container } = render(await LandingPage())
    const main = container.querySelector("main#main")
    expect(main).not.toBeNull()

    // Collect direct-child sections of
    // <main>. The TechnicalCredibility /
    // FinalCTA / Footer are direct
    // <section> / <footer> children of
    // <main> on the page. `main` is
    // asserted non-null above; the
    // explicit cast keeps the lint rule
    // happy without `!` (forbidden in
    // this repo).
    const sections = Array.from((main as HTMLElement).children).filter(
      (el): el is HTMLElement => el.tagName === "SECTION",
    )

    // Extract the section identity —
    // either id or testid, whichever the
    // section exposes.
    const identity = (el: HTMLElement): string =>
      el.id || el.getAttribute("data-testid") || el.tagName.toLowerCase()

    const ordered = sections.map(identity)
    const expected = [
      "product", // hero (id="product")
      "problem",
      "solution",
      "hybrid-search",
      "knowledge-graph",
      "agents",
      "citations",
      "demo",
      "technical-credibility",
      "final-cta",
    ]
    expect(ordered).toEqual(expected)
  })

  it("renders the marketing header above the main content", async () => {
    const { container } = render(await LandingPage())
    const header = screen.getByTestId("marketing-header")
    const main = container.querySelector("main#main")
    expect(header).toBeInTheDocument()
    expect(main).not.toBeNull()
    // The header must come before main
    // in document order. `main` is
    // asserted non-null above; the
    // explicit cast keeps the lint rule
    // happy without `!` (forbidden in
    // this repo).
    expect(
      header.compareDocumentPosition(main as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it("renders the footer after main (as a page boundary, not inside <main>)", async () => {
    // Per the F8 P5 spec: the footer
    // marks the end of the page and
    // should sit outside the <main>
    // landmark (so screen readers know
    // the page is over).
    const { container } = render(await LandingPage())
    const main = container.querySelector("main#main")
    const footer = screen.getByTestId("marketing-footer")
    expect(main).not.toBeNull()
    expect(footer).toBeInTheDocument()
    expect((main as Node).contains(footer)).toBe(false)
  })

  it("the technical strip sits between Live Demo and Final CTA (the proof → close beat)", async () => {
    // The narrative rhythm is:
    //   Demo → Technical Strip → CTA
    // The strip is intentionally a
    // quieter, calmer moment so the CTA
    // has room to land.
    const { container } = render(await LandingPage())
    const demo = container.querySelector("section#demo")
    const strip = screen.getByTestId("technical-credibility")
    const cta = screen.getByTestId("final-cta")

    expect(demo).not.toBeNull()
    expect(
      (demo as HTMLElement).compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(strip.compareDocumentPosition(cta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("does NOT render the F2 carryover sections (replaced by the F8 closing trio)", async () => {
    // The F2 carryover was:
    //   - "One platform. Every answer."
    //   - "Up and running in three steps."
    //   - "Your knowledge deserves a brain."
    // F8 P5 replaced all three. If a
    // future revision accidentally
    // re-introduces the carryover, this
    // test will fail and the contributor
    // will have to make an explicit
    // decision to override.
    render(await LandingPage())
    expect(screen.queryByText(/one platform\. every answer\./i)).not.toBeInTheDocument()
    expect(screen.queryByText(/up and running in three steps\./i)).not.toBeInTheDocument()
    expect(screen.queryByText(/your knowledge deserves a brain\./i)).not.toBeInTheDocument()
  })

  it("exposes a primary CTA in the hero AND a primary CTA in the final CTA, both pointing to /register", async () => {
    // The conversion path is wired
    // end-to-end: the hero CTA + the
    // final CTA both route to the
    // existing /register flow.
    render(await LandingPage())
    const startFree = screen.getAllByRole("link", { name: /start free/i })
    const getStarted = screen.getAllByRole("link", {
      name: /get started free/i,
    })
    // The hero has "Start free" (1 link).
    // The final CTA has "Get started
    // free" (1 link). The header's "Get
    // started" doesn't match either
    // regex (it says "Get started" not
    // "Get started free"), so we expect
    // exactly one of each.
    expect(startFree).toHaveLength(1)
    expect(getStarted).toHaveLength(1)
    expect(startFree[0]).toHaveAttribute("href", "/register")
    expect(getStarted[0]).toHaveAttribute("href", "/register")
  })

  it("the hero exposes a 'See it work' anchor that targets the demo section", async () => {
    // The hero's secondary CTA is the
    // lower-commitment action for
    // skeptical visitors. The anchor
    // must point at the in-page demo.
    render(await LandingPage())
    const seeItWork = screen.getByTestId("hero-see-it-work")
    expect(seeItWork).toHaveAttribute("href", "#demo")
  })

  it("redirects to /app/dashboard when the user has an auth hint cookie", async () => {
    // The production behavior: an
    // already-authed user should never
    // see the marketing page. We assert
    // the redirect here so a future
    // refactor can't quietly remove it.
    cookieStore.get = (name: string) => (name === "cortex_auth_hint" ? { value: "1" } : undefined)
    redirectMock.mockClear()

    let renderError: unknown = null
    try {
      render(await LandingPage())
    } catch (e) {
      renderError = e
    }
    expect(redirectMock).toHaveBeenCalledWith("/app/dashboard")
    // The mock throws so React doesn't
    // render anything — we just want
    // the call to have happened.
    expect((renderError as Error)?.message).toMatch(/__redirect:\/app\/dashboard/)

    // Reset for subsequent tests.
    cookieStore.get = () => undefined
  })
})
