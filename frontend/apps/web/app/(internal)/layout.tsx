/**
 * (internal) route group — internal development pages.
 *
 * **F1 Part 4 (Task 38).** Hosts non-production pages that
 * exist for development, design review, and QA. The most
 * important one today is the component showcase; future
 * internal pages (story-style galleries, visual regression
 * harnesses, test fixtures) live alongside it.
 *
 * **The route group is named in parens** so it doesn't add
 * a segment to the URL — `/component-showcase` is the
 * actual route.
 *
 * **No auth.** Internal pages skip the auth gate; the
 * `(app)/layout.tsx` doesn't apply here.
 */

export default function InternalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
