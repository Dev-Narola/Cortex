/**
 * Fonts — `next/font` (self-hosted at build time: no third-party request,
 * no layout shift). Inter for UI text, Manrope for headlines, JetBrains
 * Mono for identifiers, code and API keys. All three are variable fonts, so
 * one file each covers every weight. Variables are font-named; tokens.css maps
 * them to --font-sans/--font-display/--font-mono.
 */

import { Inter, JetBrains_Mono, Manrope } from "next/font/google"

export const bodyFont = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

export const displayFont = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
})

export const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
})
