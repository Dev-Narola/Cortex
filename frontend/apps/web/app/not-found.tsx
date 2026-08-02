/**
 * 404 — applies to every route group.
 */
import Link from "next/link"

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="mt-2 font-display text-3xl font-semibold">We couldn&apos;t find that page.</h1>
      <Link href="/" className="mt-6 text-sm text-ember-600 underline-offset-4 hover:underline">
        Go home
      </Link>
    </div>
  )
}
