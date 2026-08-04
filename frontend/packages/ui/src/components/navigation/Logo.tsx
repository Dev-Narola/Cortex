/**
 * Logo — the Cortex wordmark.
 *
 * **F1 Part 3 (Task 27).** Pure SVG; the gradient uses the
 * `ember-500` → `ember-300` → `volt-500` spark palette so
 * it matches the brand mark used on the marketing site.
 *
 * **Sizes.** `sm | md | lg | xl` — the same scale as the
 * Avatar. Use `sm` for the sidebar (collapsed), `md` for
 * the topbar, `lg` / `xl` for marketing surfaces.
 *
 * **Theme integration.** The mark uses the brand gradient
 * in both themes; the wordmark text uses `text-foreground`
 * so it flips with the surface.
 *
 * **No href.** The Logo is just the visual; wrap it in a
 * `next/link` (or a `SidebarItem` / `Breadcrumb` link)
 * at the call site. F1 doesn't ship a routing helper.
 */

import { type HTMLAttributes, forwardRef } from "react"

import { cn } from "../../utils/cn"

const SIZES = {
  sm: { mark: "h-5 w-5", text: "text-sm" },
  md: { mark: "h-6 w-6", text: "text-base" },
  lg: { mark: "h-8 w-8", text: "text-lg" },
  xl: { mark: "h-10 w-10", text: "text-xl" },
} as const

export type LogoSize = keyof typeof SIZES

export interface LogoProps extends HTMLAttributes<HTMLSpanElement> {
  /** Default `md`. */
  size?: LogoSize
  /** Show the wordmark text. Default `true`. */
  showText?: boolean
  /** Accessible label. Default `"Cortex"`. */
  title?: string
}

const Logo = forwardRef<HTMLSpanElement, LogoProps>(
  ({ className, size = "md", showText = true, title = "Cortex", ...props }, ref) => {
    const dims = SIZES[size]
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center gap-2 font-display font-semibold tracking-tight",
          className,
        )}
        {...props}
      >
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          className={cn(dims.mark, "shrink-0")}
        >
          <defs>
            <linearGradient
              id="cortex-logo-gradient"
              x1="0"
              y1="0"
              x2="32"
              y2="32"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="var(--ember-500)" />
              <stop offset="0.5" stopColor="var(--ember-300)" />
              <stop offset="1" stopColor="var(--volt-500)" />
            </linearGradient>
          </defs>
          <rect width="32" height="32" rx="8" fill="url(#cortex-logo-gradient)" />
          <path
            d="M9 22V10h6.5a3.5 3.5 0 0 1 1.4 6.7L20 22h-3.2l-2.6-4.6H12V22H9zm3-7.4h3.1a1.2 1.2 0 1 0 0-2.4H12v2.4z"
            fill="var(--cloud-50)"
          />
        </svg>
        {showText ? (
          <span className={cn(dims.text, "text-foreground")}>{title}</span>
        ) : (
          <span className="sr-only">{title}</span>
        )}
      </span>
    )
  },
)
Logo.displayName = "Logo"

export { Logo }
