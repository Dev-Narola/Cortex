/**
 * Section — a labelled grouping inside a page.
 *
 * **F1 Part 4 (Task 36).** Optional `title` +
 * `description` row at the top, then any children. Used
 * for: Settings sub-sections ("Profile", "Notifications",
 * "Sessions"), the Dashboard's "Recent activity" /
 * "Workspace usage" zones, the Documents page's
 * "Filters" / "Results" zones.
 *
 * **Spacing.** Vertical gap-6 between sections (matches
 * `PageContent`).
 */

import type { HTMLAttributes, ReactNode } from "react"

import { cn } from "../../utils/cn"

export interface SectionProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  /** Tag the section with an `aria-labelledby` pointing to the title. */
  labelledBy?: string
}

const Section = ({
  className,
  title,
  description,
  actions,
  labelledBy,
  children,
  ...props
}: SectionProps) => {
  const generatedId =
    labelledBy ?? (title ? `section-${Math.random().toString(36).slice(2, 9)}` : undefined)
  return (
    <section
      className={cn("flex flex-col gap-4", className)}
      aria-labelledby={generatedId}
      {...props}
    >
      {title || description || actions ? (
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            {title ? (
              <h2
                id={generatedId}
                className="font-display text-lg font-semibold tracking-tight text-foreground"
              >
                {title}
              </h2>
            ) : null}
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}
Section.displayName = "Section"

export { Section }
