/**
 * Root layout — the outermost shell of the app.
 *
 * **F0 scope (Task 14).** Does only what every page needs and
 * nothing more. Per spec:
 *
 *   1. Imports fonts (from `app/fonts.ts`).
 *   2. Imports globals (`@cortex/ui/globals.css` + `./globals.css`).
 *   3. Renders the HTML skeleton.
 *   4. Mounts the `<Providers>` tree.
 *   5. Sets metadata.
 *   6. Sets viewport (theme-color + color-scheme).
 *   7. Sets the favicon.
 *
 * **Never put business logic here.** No auth, no router state,
 * no feature-specific markup. The route-group layouts
 * (`(marketing)`, `(auth)`, `(app)`) own their own theme and shell.
 */

import type { Metadata, Viewport } from "next"

import "@cortex/ui/globals.css"
import "./globals.css"

import { Providers } from "@/components/providers"
import { bodyFont, displayFont, monoFont } from "./fonts"

export const metadata: Metadata = {
  title: {
    default: "Cortex",
    template: "%s · Cortex",
  },
  description:
    "Multi-tenant AI Knowledge & Agent Platform. Hybrid search, knowledge graph, agents, and MCP — production-grade.",
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
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
