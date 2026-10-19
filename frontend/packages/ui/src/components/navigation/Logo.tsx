/**
 * Logo — the Cortex wordmark.
 *
 * Pure SVG: a charcoal lightning bolt on an orange tile, the same
 * mark as `public/favicon.svg`.
 *
 * **Sizes.** `sm | md | lg | xl` — the same scale as the
 * Avatar. Use `sm` for the sidebar (collapsed), `md` for
 * the topbar, `lg` / `xl` for marketing surfaces.
 *
 * **Theme integration.** The mark is identical in both themes;
 * the wordmark text uses `text-foreground` so it flips with the surface.
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
          {/* Lightning bolt on an orange tile: the bolt stays charcoal in
              both themes so the mark reads the same everywhere. */}
          <rect width="32" height="32" rx="9" fill="var(--orange-400)" />
          <path
            d="M18.4 5.5 9.6 17.6h6l-1.9 8.9 8.8-12.3h-6l1.9-8.7z"
            fill="#202020"
            stroke="#202020"
            strokeWidth="1.2"
            strokeLinejoin="round"
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
