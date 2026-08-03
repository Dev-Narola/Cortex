/**
 * Root layout — the outermost shell of the app.
 *
 * **F0 scope (Task 14 + 44).** Per spec, this file does:
 *   1. Imports fonts (from `app/fonts.ts`).
 *   2. Imports globals (`@cortex/ui/globals.css` + `./globals.css`).
 *   3. Renders the HTML skeleton.
 *   4. Mounts the `<Providers>` tree.
 *   5. Sets metadata (Task 44: title template, description, OG,
 *      Twitter, manifest, robots).
 *   6. Sets viewport (theme-color + color-scheme).
 *   7. Sets the favicon + manifest.
 *   8. Renders a skip-to-content link for keyboard users
 *      (Task 43: accessibility foundation).
 *
 * **Never put business logic here.** No auth, no router state,
 * no feature-specific markup. The route-group layouts
 * (`(marketing)`, `(auth)`, `(app)`) own their own theme and shell.
 *
 * **Per-page metadata.** A page can override any of these by
 * exporting its own `metadata` constant. The `title.template`
 * makes the per-page title read "Page name · Cortex" without
 * the page having to repeat the suffix.
 */

import type { Metadata, Viewport } from "next"

import "@cortex/ui/globals.css"
import "./globals.css"

import { Providers } from "@/components/providers"
import { bodyFont, displayFont, monoFont } from "./fonts"

const APP_NAME = "Cortex"
const APP_DESCRIPTION =
  "Multi-tenant AI Knowledge & Agent Platform. Hybrid search, knowledge graph, agents, and MCP — production-grade."
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  keywords: [
    "knowledge base",
    "AI agents",
    "RAG",
    "retrieval augmented generation",
    "knowledge graph",
    "MCP",
    "multi-tenant",
  ],
  authors: [{ name: "Cortex" }],
  creator: "Cortex",
  metadataBase: new URL(APP_URL),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: APP_NAME,
    description: APP_DESCRIPTION,
    url: APP_URL,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: APP_NAME,
    description: APP_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: "/favicon.svg",
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafbfc" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0c" },
  ],
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`}
      suppressHydrationWarning
    >
      <body>
        {/* Skip-to-content for keyboard users (Task 43). */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-lg focus:ring-2 focus:ring-ring"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
