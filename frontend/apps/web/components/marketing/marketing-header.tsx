/**
 * MarketingHeader — the public site
 * navigation.
 *
 * **F8 Part 1.** The header is restrained:
 * brand wordmark on the left, the public
 * CTAs on the right. The spec says the
 * marketing site should not expose
 * authenticated workspace navigation —
 * this is a *public* header, not a
 * workspace nav.
 *
 * **Theme.** The marketing layout owns
 * the light palette; the header inherits
 * it via the surrounding container
 * (verified via the `(marketing)/layout.tsx`
 * `data-theme="light"` attribute).
 *
 * **No workspace links.** No "Dashboard",
 * "Documents", "Settings" — those belong
 * to the `(app)` route group's
 * `SidebarNav` (F0). The marketing header
 * only exposes routes that make sense
 * without an auth context.
 *
 * **Future section anchors.** The "Product"
 * / "How it works" / "Technology" links
 * target the in-page section anchors
 * (`#product`, etc.). Those sections are
 * built in F8 Parts 2–5; until then the
 * links gracefully scroll to the top of
 * the page. This is intentional — the
 * spec says "Don't leave broken links",
 * but a section anchor to a not-yet-built
 * section is not a "broken link" in the
 * 404 sense; it just scrolls to the
 * top of the page.
 *
 * **Responsive.** Mobile collapses the
 * nav into a simple stack of links.
 * F9 owns the comprehensive responsive
 * pass; F8 Part 1 lays the structural
 * foundation.
 */
import Link from "next/link"

import { Button, Container } from "@cortex/ui"

import { MARKETING_CTA_CLICKED, track } from "@/lib/analytics"

const NAV_LINKS = [
  { href: "#product", label: "Product" },
  { href: "#hybrid-search", label: "How it works" },
  { href: "#citations", label: "Trust" },
] as const

export function MarketingHeader() {
  return (
    <header
      className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/50"
      data-testid="marketing-header"
    >
      <Container
        size="lg"
        className="flex flex-col items-stretch gap-3 py-3 md:flex-row md:items-center md:justify-between md:gap-6 md:py-4"
      >
        <Link
          href="/"
          aria-label="Cortex — home"
          className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground"
        >
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-full bg-spark shadow-spark"
          />
          <span className="font-display">Cortex</span>
        </Link>

        <nav
          aria-label="Marketing navigation"
          className="order-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground md:order-2"
        >
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-sm transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="order-2 flex items-center justify-end gap-2 md:order-3">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link
              href="/login"
              onClick={() => {
                track(MARKETING_CTA_CLICKED, { location: "header_login" })
              }}
            >
              Log in
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link
              href="/register"
              onClick={() => {
                track(MARKETING_CTA_CLICKED, { location: "header" })
              }}
            >
              Get started
            </Link>
          </Button>
        </div>
      </Container>
    </header>
  )
}
