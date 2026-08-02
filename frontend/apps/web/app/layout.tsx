/**
 * Root layout — applies fonts, theme provider, and the (app) /
 * (marketing) / (auth) wrappers. Every page inherits this.
 *
 * V9 Frontend: Bricolage Grotesque + JetBrains Mono are the
 * display / mono pair; Inter handles body text. All three are
 * self-hosted via `next/font` so the hero renders font-correct
 * on the first paint (no FOUC, no extra request).
 */
import type { Metadata, Viewport } from "next"
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from "next/font/google"

import "@cortex/ui/globals.css"
import "./globals.css"

import { Providers } from "@/components/providers"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
})

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
})

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
})

export const metadata: Metadata = {
  title: {
    default: "Cortex",
    template: "%s · Cortex",
  },
  description:
    "Multi-tenant AI Knowledge & Agent Platform. Hybrid search, knowledge graph, agents, and MCP — production-grade.",
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafbfc" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0c" },
  ],
  colorScheme: "light dark",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${display.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
