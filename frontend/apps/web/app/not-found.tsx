/**
 * 404 — applies to every route group.
 */
import { Logo } from "@cortex/ui"
import Link from "next/link"

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <Logo size="lg" showText={false} />
      <p className="mt-6 font-mono text-sm text-muted-foreground">404</p>
      <h1 className="mt-2 font-display text-[2rem] font-medium tracking-[-0.02em] text-foreground">
        We couldn&apos;t find that page.
      </h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        The link may be old, or the page moved. Your workspace is one click away.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Go home
      </Link>
    </div>
  )
}
