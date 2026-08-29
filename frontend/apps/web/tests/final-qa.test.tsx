/**
 * Final QA — F9 Part 5.
 *
 * Pins the F9 P5 audit document's contracts as a regression
 * net. The test verifies:
 *
 *   1. Design token discipline: the token table
 *      (`packages/ui/src/styles/tokens.css`) is the
 *      single source of truth for every theme colour.
 *   2. No arbitrary `rgb(` / `rgba(` / `hsl(` colour
 *      declarations in the marketing + app surface
 *      (the documented exception is the Spark Glow in
 *      StreamingMessage).
 *   3. No arbitrary `#hex` colour declarations in the
 *      marketing + app surface. The 8 raw hex values
 *      that exist are allow-listed: the 3D/2D canvas
 *      code + the marketing visuals that use the Spark
 *      gradient stops + the PWA theme-color meta tag
 *      in `app/layout.tsx`.
 *   4. The Spark gradient is rationed to the marketing
 *      surface + the StreamingMessage Spark Glow + the
 *      2D graph's active-path treatment. Zero usage in
 *      the rest of the app shell.
 *   5. Typography hygiene: zero raw `font-family`
 *      declarations in the components directory (every
 *      font comes from the Tailwind theme).
 *
 * **Why file-walk tests.** The spec's audit checklist
 * is a source-level review. Pinning the source-level
 * contract as a test means a future contributor who
 * quietly introduces an arbitrary colour or a stray
 * `font-family` fails CI.
 *
 * **What is excluded from the walks.** The `tests/`
 * directory contains its own colour literals as test
 * assertions (e.g. `expect(...).toBe("#84cc16")`) —
 * those are intentional, not violations. The audit
 * doc is also excluded.
 */
import { describe, expect, it } from "vitest"

import { promises as fs } from "node:fs"
import path from "node:path"

async function walk(
  dir: string,
  skipDirs: ReadonlySet<string> = new Set(["node_modules", ".next", "tests"]),
): Promise<string[]> {
  const out: string[] = []
  let entries: Awaited<ReturnType<typeof fs.readdir>>
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (skipDirs.has(e.name)) continue
      out.push(...(await walk(p, skipDirs)))
    } else if (e.name.endsWith(".tsx") || e.name.endsWith(".ts")) {
      out.push(p)
    }
  }
  return out
}

describe("Final QA — F9 Part 5 (design token discipline + Spark rationing + typography)", () => {
  it("the design token table is the single source of truth (Cloud / Paper / Ink / Mist / Ember / Volt / Void / Slate)", async () => {
    // The token table is the entry point
    // for every theme colour. A future
    // contributor who adds a new colour
    // to a component without going
    // through the token table is
    // violating the design system
    // contract.
    //
    // process.cwd() is `apps/web/` from
    // vitest, so we go up TWO levels to
    // reach the monorepo root before
    // descending into `packages/`.
    const tokensPath = path.resolve(process.cwd(), "..", "..", "packages/ui/src/styles/tokens.css")
    const tokens = await fs.readFile(tokensPath, "utf8")
    for (const token of [
      "cloud-50",
      "paper-50",
      "ink-900",
      "mist-500",
      "mist-700",
      "ember-500",
      "volt-500",
      "void-950",
      "slate-800",
    ]) {
      expect(tokens).toContain(`--${token}:`)
    }
  })

  it("no arbitrary rgb / rgba / hsl declarations in the marketing + app surface (the documented Spark Glow is allow-listed)", async () => {
    // The marketing surface + the rest
    // of the app shell use the design
    // token utilities (bg-cloud-50,
    // text-ink-900, etc.). The only
    // documented exception is the
    // Spark Glow backdrop in
    // StreamingMessage.
    const appWeb = path.resolve(process.cwd())
    const files = await walk(appWeb)
    const offenders: { file: string; line: number; match: string }[] = []
    const allowList = new Set<string>([
      // The Spark Glow backdrop in
      // StreamingMessage. Documented
      // in the F9 P5 audit (§2.3).
      path.join("components", "chat", "StreamingMessage.tsx"),
    ])
    for (const file of files) {
      const rel = path.relative(appWeb, file)
      if (allowList.has(rel)) continue
      const src = await fs.readFile(file, "utf8")
      const lines = src.split("\n")
      // Match rgb(, rgba(, hsl(, hsla(
      // — but only OUTSIDE comments.
      // The regex requires a non-comment
      // context: the match must not be
      // preceded by `//` or `*` on the
      // same line.
      const re = /(\brgba?\(|\bhsla?\()/
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? ""
        const trimmed = line.trim()
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue
        if (re.test(line)) {
          offenders.push({ file: rel, line: i + 1, match: trimmed })
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it("no arbitrary #hex colour declarations in the marketing + app surface (the canvas + marketing visuals + PWA theme are allow-listed)", async () => {
    // The 3D / 2D canvas code + the
    // marketing visuals use raw hex
    // values for the R3F + SVG render
    // paths (Spark gradient stops).
    // The PWA theme-color meta tag in
    // app/layout.tsx also uses raw hex
    // because the browser expects a
    // literal colour value. All of
    // these are explicitly documented
    // in the F9 P5 audit (§2.3) and
    // pinned in the allow-list below.
    const appWeb = path.resolve(process.cwd())
    const files = await walk(appWeb)
    const offenders: { file: string; line: number; match: string }[] = []
    const allowList = new Set<string>([
      // 3D / 2D canvas code — Documented
      // in F9 P5 audit §2.3.
      path.join("components", "graph", "graph-canvas-2d.tsx"),
      path.join("components", "graph", "graph-canvas.tsx"),
      path.join("components", "graph", "graph-edge.tsx"),
      path.join("components", "graph", "graph-node.tsx"),
      // The Spark Glow (rgba only) lives
      // here — already allow-listed in
      // the rgb test above, but this
      // file also contains a couple of
      // hex fallbacks we explicitly
      // documented.
      path.join("components", "chat", "StreamingMessage.tsx"),
      // Marketing visuals that use the
      // Spark gradient stops
      // (#FF6A3D + #0BE3C4). The
      // gradient is a documented design
      // token value, but the inline SVG
      // stop-color attribute can't be
      // expressed as a Tailwind utility.
      path.join("components", "marketing", "hero", "hero-visual.tsx"),
      path.join("components", "marketing", "features", "knowledge-graph-visual.tsx"),
      // PWA theme-color meta tags in the
      // root layout. The browser expects
      // a literal `#hex` value here.
      path.join("app", "layout.tsx"),
    ])
    // Match #RRGGBB / #RGB as a hex
    // colour literal. We exclude
    // comments via a coarse filter
    // (any line starting with `//` or
    // `*` is a comment).
    const hexRe = /#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})\b/
    for (const file of files) {
      const rel = path.relative(appWeb, file)
      if (allowList.has(rel)) continue
      const src = await fs.readFile(file, "utf8")
      const lines = src.split("\n")
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? ""
        const trimmed = line.trim()
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue
        if (hexRe.test(line)) {
          offenders.push({ file: rel, line: i + 1, match: trimmed })
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it("the Spark gradient is contained to the marketing surface + the documented Spark Glow + active-path treatment", async () => {
    // The Spark gradient is rationed to
    // the marketing surface (per the
    // UI/UX spec §19 "at most one
    // Spark-gradient moment per
    // screen") + the StreamingMessage
    // Spark Glow (per the same spec,
    // the in-app Spark usage is
    // limited to the actively streaming
    // state) + the 2D graph's
    // active-path treatment.
    //
    // The app shell (everything NOT in
    // the allow-list below) must NOT
    // use bg-spark / text-spark /
    // border-spark / shadow-spark.
    const appWeb = path.resolve(process.cwd())
    const files = await walk(appWeb)
    const offenders: { file: string; line: number; match: string }[] = []
    const allowList = new Set<string>([
      // Marketing surface — Spark is
      // rationed to one moment per
      // screen within this group.
      path.join("components", "marketing", "marketing-header.tsx"),
      path.join("components", "marketing", "hero", "hero-section.tsx"),
      path.join("components", "marketing", "hero", "hero-visual.tsx"),
      path.join("components", "marketing", "hero", "hero-background.tsx"),
      path.join("components", "marketing", "problem", "problem-section.tsx"),
      path.join("components", "marketing", "solution", "solution-section.tsx"),
      path.join("components", "marketing", "footer.tsx"),
      path.join("components", "marketing", "final-cta.tsx"),
      path.join("components", "marketing", "technical-credibility.tsx"),
      path.join("components", "marketing", "demo", "live-demo-section.tsx"),
      path.join("components", "marketing", "demo", "demo-input.tsx"),
      path.join("components", "marketing", "demo", "demo-message.tsx"),
      path.join("components", "marketing", "demo", "demo-question-chips.tsx"),
      path.join("components", "marketing", "features", "feature-section.tsx"),
      path.join("components", "marketing", "features", "hybrid-search-visual.tsx"),
      path.join("components", "marketing", "features", "knowledge-graph-visual.tsx"),
      path.join("components", "marketing", "features", "agents-mcp-visual.tsx"),
      path.join("components", "marketing", "features", "citations-visual.tsx"),
      // Spark Glow (the in-app
      // Spark usage) — documented in
      // F9 P5 audit §2.3.
      path.join("components", "chat", "StreamingMessage.tsx"),
      // The 2D graph's active-path
      // treatment (F9 P2).
      path.join("components", "graph", "graph-canvas-2d.tsx"),
    ])
    const sparkRe = /(\bbg-spark\b|\btext-spark\b|\bborder-spark\b|\bshadow-spark\b)/
    for (const file of files) {
      const rel = path.relative(appWeb, file)
      if (allowList.has(rel)) continue
      const src = await fs.readFile(file, "utf8")
      const lines = src.split("\n")
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? ""
        const trimmed = line.trim()
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue
        if (sparkRe.test(line)) {
          offenders.push({ file: rel, line: i + 1, match: trimmed })
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it("typography uses the design token utilities (zero raw font-family declarations in components)", async () => {
    // The fonts are wired in
    // `apps/web/app/fonts.ts` and
    // exposed as CSS variables. No
    // component should declare a
    // `font-family:` raw — they all
    // use the Tailwind theme
    // (font-display, font-sans,
    // font-mono).
    const appWeb = path.resolve(process.cwd(), "components")
    const files = await walk(appWeb)
    const offenders: { file: string; line: number; match: string }[] = []
    const fontRe = /font-family\s*:/i
    for (const file of files) {
      const src = await fs.readFile(file, "utf8")
      const lines = src.split("\n")
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? ""
        const trimmed = line.trim()
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue
        if (fontRe.test(line)) {
          offenders.push({
            file: path.relative(process.cwd(), file),
            line: i + 1,
            match: trimmed,
          })
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
