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

import { Card, Icon, Logo, Text } from "@cortex/ui"

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

const POINTS = [
  { icon: "Search", text: "Hybrid keyword + semantic search, reranked for relevance" },
  { icon: "Quote", text: "Answers cite the exact passage they came from" },
  { icon: "Bot", text: "Agents and MCP tools that work on your own documents" },
] as const

export function AuthLayout({
  title,
  description,
  children,
  footer,
  backHref = "/",
  homeHref = "/",
}: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      {/* Brand panel (desktop): what Cortex is, in three lines. */}
      <aside className="relative hidden p-4 lg:flex lg:w-[44%] lg:max-w-2xl">
        <div className="flex w-full flex-col justify-between overflow-hidden rounded-3xl border border-brand-border bg-brand-soft p-10">
          <Link
            href={homeHref as never}
            aria-label="Cortex home"
            className="self-start rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Logo size="md" />
          </Link>
          <div className="space-y-8">
            <h2 className="max-w-md font-display text-[2.5rem] font-medium leading-[1.08] tracking-[-0.03em] text-foreground">
              Your knowledge, answered with sources.
            </h2>
            <ul className="space-y-3">
              {POINTS.map((p) => (
                <li key={p.text} className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card text-brand shadow-xs">
                    <Icon name={p.icon} className="h-4 w-4" aria-hidden />
                  </span>
                  {p.text}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Cortex — Knowledge, connected.
          </p>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between px-6 py-5 sm:px-10">
          <Link
            href={homeHref as never}
            aria-label="Cortex home"
            className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:invisible"
          >
            <Logo size="md" />
          </Link>
          {backHref ? (
            <Link
              href={backHref as never}
              className="rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              ← Back
            </Link>
          ) : null}
        </header>

        <main className="flex flex-1 items-center justify-center px-5 pb-12 sm:px-6">
          <div className="w-full max-w-sm animate-rise-in">
            <div className="mb-6 space-y-2">
              <h1 className="font-display text-[1.875rem] font-medium leading-tight tracking-[-0.02em] text-foreground">
                {title}
              </h1>
              {description ? (
                <Text tone="muted" size="sm">
                  {description}
                </Text>
              ) : null}
            </div>
            <Card radius="xl" className="p-6 shadow-sm">
              {children}
            </Card>
            {footer ? <div className="mt-5 px-1">{footer}</div> : null}
          </div>
        </main>

        <footer className="px-6 py-4 text-center text-xs text-muted-foreground sm:px-10 lg:hidden">
          © {new Date().getFullYear()} Cortex — Knowledge, connected.
        </footer>
      </div>
    </div>
  )
}
