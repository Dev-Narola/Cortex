/**
 * AuthLayout — the centered card shell for every
 * authentication page.
 *
 * **F2 Part 1 (Task 2).** Single source of truth for the
 * "sign in to Cortex" chrome. Login, register, forgot-
 * password, and reset-password all consume this layout;
 * never duplicate the wrapper in the page.
 *
 * **Composition.** The page passes:
 *   - `title`       — the H1 (e.g. "Sign in", "Create your
 *                     account").
 *   - `description` — supporting line under the title.
 *   - `children`    — the form.
 *   - `footer`      — a row of links (e.g. "Forgot
 *                     password?", "Need an account?").
 *   - `backHref`    — optional link back to the marketing
 *                     site.
 *
 * **Why a max-w-sm card.** The forms are single-column
 * (tenant_slug / email / password, or name / email /
 * password). Anything wider makes the form feel
 * unimportant; narrower feels claustrophobic.
 *
 * **No business logic.** Layout only — the page owns
 * the form + the submit handler.
 */

import Link from "next/link"
import type { ReactNode } from "react"

import { Card, CardContent, Logo, Text } from "@cortex/ui"

export interface AuthLayoutProps {
  title: string
  description?: string
  children: ReactNode
  /** Row of secondary links rendered below the form. */
  footer?: ReactNode
  /** Optional link back to the marketing site. */
  backHref?: string
  /** Optional href for the logo (defaults to the marketing site). */
  homeHref?: string
}

export function AuthLayout({
  title,
  description,
  children,
  footer,
  backHref = "/",
  homeHref = "/",
}: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top bar — logo + back link. */}
      <header className="flex items-center justify-between border-b border-border bg-background/80 px-6 py-4 backdrop-blur sm:px-10">
        <Link
          href={homeHref as never}
          aria-label="Cortex home"
          className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Logo size="md" />
        </Link>
        {backHref ? (
          <Link
            href={backHref as never}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Back
          </Link>
        ) : null}
      </header>

      {/* Card column. */}
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <Card>
            <CardContent className="space-y-2 pt-6">
              <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
                {title}
              </h1>
              {description ? (
                <Text tone="muted" size="sm">
                  {description}
                </Text>
              ) : null}
            </CardContent>
            <CardContent className="pt-6">{children}</CardContent>
            {footer ? (
              <CardContent className="border-t border-border pt-6">{footer}</CardContent>
            ) : null}
          </Card>
        </div>
      </main>

      {/* Footer. */}
      <footer className="border-t border-border px-6 py-4 text-center text-xs text-muted-foreground sm:px-10">
        © {new Date().getFullYear()} Cortex — Knowledge, connected.
      </footer>
    </div>
  )
}
