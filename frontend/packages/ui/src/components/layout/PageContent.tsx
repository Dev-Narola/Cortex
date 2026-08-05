/**
 * PageContent — the main content body of a page.
 *
 * **F1 Part 4 (Task 36).** A vertical stack with the
 * canonical inter-section gap (`gap-6`). Pair with
 * `Page` + `PageHeader` for the standard composition.
 *
 * **No business logic.** The content area is layout-only;
 * the call site composes the cards / tables / forms.
 */

import { type HTMLAttributes, forwardRef } from "react"

import { cn } from "../../utils/cn"

export interface PageContentProps extends HTMLAttributes<HTMLDivElement> {}

const PageContent = forwardRef<HTMLDivElement, PageContentProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-1 flex-col gap-6", className)} {...props} />
))
PageContent.displayName = "PageContent"

export { PageContent }
