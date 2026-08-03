/**
 * Fonts — `next/font` configuration.
 *
 * **F0 scope (Task 13).** All three fonts are self-hosted via
 * `next/font` so the first paint renders correctly without a
 * runtime Google Fonts request. The CSS variables defined here
 * map directly to the `--font-display`, `--font-sans`, and
 * `--font-mono` variables in `tokens.css`.
 *
 * **Why three exports.** The UI specification calls out three
 * roles:
 *   - `displayFont` — large headings, hero, branding. Bricolage
 *     Grotesque. Variable font, gives us the full weight range
 *     for free.
 *   - `bodyFont` — running text. General Sans is the design-spec
 *     choice but isn't on Google Fonts; we use Inter as the
 *     self-hostable substitute and keep the variable name neutral
 *     so swapping in the real one later is a one-line change.
 *   - `monoFont` — code, token strings, technical readouts.
 *     JetBrains Mono.
 *
 * **Why not a `<link>` to fonts.googleapis.com.** next/font
 * downloads the font files at build time and serves them from
 * the same origin — no third-party request, no FOUC, no extra
 * DNS lookup on the critical path. The spec is explicit about
 * self-hosting.
 */

import { Bricolage_Grotesque, Inter, JetBrains_Mono } from "next/font/google"

export const displayFont = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800"],
})

export const bodyFont = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
})

export const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500", "700"],
})
