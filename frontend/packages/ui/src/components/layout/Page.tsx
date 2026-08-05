/**
 * Page — the root surface for a single route.
 *
 * **F1 Part 4 (Task 36).** Provides consistent vertical
 * rhythm + horizontal padding for the authenticated app.
 * Pair with `PageHeader` + `PageContent` for the canonical
 * composition.
 *
 * **Sizes.** `sm | md | lg | full`. `sm` is a narrow column
 * for forms (the auth + settings detail pages); `md` is the
 * default for most pages; `lg` is for the dashboard and the
 * graph explorer; `full` is for the chat / documents table
 * where every pixel counts.
 *
 * **No business logic.** This is layout-only; the page
 * composes the Sidebar, Topbar, and content slots. Routing
 * is the app layer's job.
 */

import { type HTMLAttributes, forwardRef } from "react"

import { cn } from "../../utils/cn"

const SIZE = {
  sm: "max-w-2xl",
  md: "max-w-5xl",
  lg: "max-w-7xl",
  full: "max-w-none",
} as const

export type PageSize = keyof typeof SIZE

export interface PageProps extends HTMLAttributes<HTMLElement> {
  /** Default `md`. */
  size?: PageSize
}

const Page = forwardRef<HTMLElement, PageProps>(({ className, size = "md", ...props }, ref) => (
  <main
    ref={ref}
    className={cn(
      "mx-auto flex w-full flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8",
      SIZE[size],
      className,
    )}
    {...props}
  />
))
Page.displayName = "Page"

export { Page }
