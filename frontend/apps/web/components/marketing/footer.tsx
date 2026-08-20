/**
 * Footer — the F8 marketing "Footer" beat.
 *
 * **F8 Part 5.** The end of the public
 * marketing page. The spec calls for:
 *
 *   - Mono / caption typography
 *   - Mist text on Cloud background
 *   - Product / Docs / GitHub-if-public /
 *     Legal columns
 *   - Calm boundary (border-top, no big
 *     gradient, no floating decoration)
 *
 * **Honesty principle.** The F8 spec is
 * explicit about a few of the destinations:
 *
 *   - "GitHub if public" — the Cortex
 *     repository is private (the PRD
 *     leaves the final public disposition
 *     open), so this footer does NOT show
 *     a GitHub link. The alternative —
 *     shipping a dead link — is worse than
 *     shipping no link.
 *   - Documentation: there is no public
 *     docs route today, so the footer
 *     does NOT link to one. The "Resources"
 *     column instead surfaces the product
 *     surfaces that already exist.
 *   - Legal: no Privacy / Terms pages
 *     exist yet, so the footer does NOT
 *     link to them. Future placeholders
 *     belong to a later milestone.
 *
 * **No fake destinations.** This is the
 * single most important rule for the
 * footer. The page should never expose a
 * link that 404s.
 *
 * **Product links.** The footer DOES link
 * to authenticated routes (Dashboard,
 * Graph, Agents) — anonymous users will
 * naturally land on the auth surface,
 * which is the intended conversion path
 * for a public marketing page.
 *
 * **Responsive.** Desktop: brand + three
 * columns in a row. Mobile: brand on top,
 * each column stacks below.
 *
 * **Accessibility.** Each column has a
 * visible heading (a real `<h3>`) and is
 * wrapped in a `<nav aria-label="...">`
 * so screen reader users can jump
 * between groups. The brand line uses
 * an aria-label so the link's accessible
 * name reads "Cortex — home" rather than
 * "Cortex".
 */
import Link from "next/link"

import { Container } from "@cortex/ui"

/**
 * Product columns — kept in this module
 * because they're presentational, not
 * data, and they're only consumed by the
 * footer. If a future revision needs to
 * share these elsewhere, promote to a
 * dedicated config file.
 */
const PRODUCT_LINKS = [
  { href: "/app/dashboard", label: "Dashboard" },
  { href: "/app/graph", label: "Knowledge graph" },
  { href: "/app/conversations", label: "Conversations" },
  { href: "/app/documents", label: "Documents" },
] as const

const RESOURCES_LINKS = [
  { href: "/app/settings/team", label: "Team" },
  { href: "/app/settings/api-keys", label: "API keys" },
  { href: "/app/settings/usage", label: "Usage" },
  { href: "/app/settings/audit-log", label: "Audit log" },
] as const

// Legal links intentionally omitted —
// Privacy and Terms pages don't exist in
// the public route surface today. The
// F8 P5 spec is explicit: don't ship a
// dead link.

export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer
      aria-labelledby="footer-heading"
      data-testid="marketing-footer"
      className="relative border-t border-border bg-background/60 font-mono"
    >
      <h2 id="footer-heading" className="sr-only">
        Site footer
      </h2>

      <Container size="lg" className="py-12 md:py-14">
        <div className="grid gap-10 md:grid-cols-4 md:gap-8">
          {/* Brand column */}
          <div className="space-y-3 md:col-span-1">
            <Link
              href="/"
              aria-label="Cortex — home"
              className="inline-flex items-center gap-2 font-display text-sm font-semibold tracking-tight text-foreground"
            >
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-full bg-spark shadow-spark"
              />
              Cortex
            </Link>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Private AI knowledge, retrieval, and agents for teams that take citation seriously.
            </p>
          </div>

          {/* Product column */}
          <nav aria-label="Product" data-testid="footer-nav-product">
            <h3 className="text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
              Product
            </h3>
            <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
              {PRODUCT_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="rounded-sm transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Resources column */}
          <nav aria-label="Resources" data-testid="footer-nav-resources">
            <h3 className="text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
              Resources
            </h3>
            <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
              {RESOURCES_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="rounded-sm transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/*
            Legal column — present as a
            landmark for screen readers so
            the footer structure is
            predictable, but the column
            itself ships empty per the F8 P5
            spec (no Privacy / Terms pages
            exist yet — don't ship dead
            links).

            The aria-label is still set so
            landmark navigation lands in a
            meaningful group, not a
            mysterious empty `<nav>`.
          */}
          <nav aria-label="Legal" data-testid="footer-nav-legal" className="hidden md:block">
            <h3 className="text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
              Legal
            </h3>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground/70">
              Policies coming soon.
            </p>
          </nav>
        </div>

        {/* Bottom row — copyright + small
            meta. The bottom row uses a
            subtle top border so the
            page boundary reads as "the page
            is over", per the F8 P5 spec:
            "the page should finish calmly". */}
        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-border/60 pt-6 text-[0.6875rem] text-muted-foreground/80 sm:flex-row sm:items-center">
          <p data-testid="footer-copyright">© {year} Cortex. All rights reserved.</p>
          <p className="text-muted-foreground/60">
            Built for teams that take their knowledge seriously.
          </p>
        </div>
      </Container>
    </footer>
  )
}
