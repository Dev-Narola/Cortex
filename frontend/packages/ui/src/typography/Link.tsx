/**
 * Link — branded anchor.
 *
 * **F1 scope (Task 8).** Wraps `<a>` with the design system's
 * `text-ember-600` accent + underline-on-hover. The `tone`
 * axis covers the inverse + muted variants for use on dark
 * surfaces and inside helper text.
 *
 * **External links** get `rel="noopener noreferrer"` and
 * `target="_blank"` automatically when `href` starts with
 * `http://` / `https://` / `mailto:` / `tel:`. The detection
 * is opt-out via `external={false}`.
 *
 * **Why no `next/link` here.** The UI package is framework-
 * agnostic; `next/link` is an app-level concern. If a Next.js
 * app wants the prefetch behaviour, it can wrap:
 *
 *   <Link href="...">Foo</Link>           // this component
 *
 *   // or, with prefetch:
 *   <Link asChild href="..."><a>Foo</a></Link>
 */

import { type AnchorHTMLAttributes, forwardRef } from "react"

import { cn } from "../utils/cn"

export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  /** Force external-link behaviour regardless of URL shape. */
  external?: boolean
}

function isExternalHref(href: string | undefined): boolean {
  if (!href) return false
  return /^(https?:)?\/\//i.test(href) || href.startsWith("mailto:") || href.startsWith("tel:")
}

const Link = forwardRef<HTMLAnchorElement, LinkProps>(
  ({ className, href, children, external, ...props }, ref) => {
    const externalLink = external ?? isExternalHref(href)
    return (
      <a
        ref={ref}
        href={href}
        rel={externalLink ? "noopener noreferrer" : undefined}
        target={externalLink ? "_blank" : undefined}
        className={cn(
          "text-ember-600 underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm",
          "decoration-ember-600/40 hover:decoration-ember-600",
          className,
        )}
        {...props}
      >
        {children}
      </a>
    )
  },
)
Link.displayName = "Link"

export { Link }
