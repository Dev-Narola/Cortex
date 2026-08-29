/**
 * Fonts — `next/font` configuration.
 *
 * **Modern + retro pairing.** F4 P4+ picks a
 * stack that reads as "contemporary SaaS with
 * a retro accent" — the kind of typographic
 * tension that makes a workspace feel
 * crafted instead of default.
 *
 *   - `displayFont` — Bricolage Grotesque for
 *     headings + brand. The variable axis
 *     gives us the full weight range for
 *     free, and the slightly humanist strokes
 *     carry the "retro" half of the brief.
 *   - `bodyFont` — Space Grotesk for running
 *     text. The geometric forms + open
 *     apertures feel distinctly modern; the
 *     subtle retro proportions in the digits
 *     echo the display font's voice without
 *     copying it.
 *   - `monoFont` — JetBrains Mono for code,
 *     token strings, technical readouts. The
 *     consistent choice for monospace across
 *     the app (kept from F0 for continuity).
 *
 * **Why self-hosted.** `next/font` downloads
 * the files at build time and serves them
 * from the same origin — no third-party
 * request, no FOUC, no extra DNS lookup on
 * the critical path. The spec is explicit
 * about self-hosting.
 *
 * **The weight sets.** Display goes heavier
 * than body because the heading cuts are
 * already large; the body needs the medium
 * range for inline emphasis (links, code
 * markers). Mono uses the standard 400/500/700
 * set so terminal-style accents stay legible.
 */

import {
  Bricolage_Grotesque,
  JetBrains_Mono,
  Space_Grotesk,
} from "next/font/google"

export const displayFont = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  // F10-Part 2: trimmed from 6 weights to 2. The F0–F9
  // implementation only uses `font-medium` (500) and
  // `font-semibold` (600) on display surfaces — the 300,
  // 400, 700, 800 weights were never referenced.
  weight: ["500", "600"],
})

export const bodyFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  // F10-Part 2: trimmed from 5 weights to 2. The body
  // text also only uses `font-medium` (500) and
  // `font-semibold` (600) across the F0–F9 implementation.
  weight: ["500", "600"],
})

export const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  // F10-Part 2: kept 400 + 500, ADDED 600. The F0–F9
  // implementation uses `font-medium` and `font-semibold`
  // on mono elements (timestamps, API key masks, MCP
  // tokens, code blocks). The previous set was missing
  // 600 entirely, so any mono + semibold element fell
  // back to a CSS-synthesized bold.
  weight: ["400", "500", "600"],
})
