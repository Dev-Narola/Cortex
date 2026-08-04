/**
 * Topbar — the top chrome of the authenticated app.
 *
 * **F1 Part 3 (Task 27).** Sits above the page content,
 * pinned to the top. Houses the (mobile) menu toggle,
 * a breadcrumb slot, a search placeholder, a
 * notifications placeholder, and the user avatar.
 *
 * **Layout.** Three-column: left (toggle + breadcrumb),
 * centre (search), right (notifications + user menu).
 * Stacks on mobile.
 *
 * **No routing.** Slots are simple `<div>`s; the call
 * site wires each piece.
 */

import { type HTMLAttributes, forwardRef } from "react"

import { cn } from "../../utils/cn"

export interface TopbarProps extends HTMLAttributes<HTMLElement> {
  /** Left slot (menu toggle + breadcrumb). */
  start?: React.ReactNode
  /** Centre slot (search). */
  center?: React.ReactNode
  /** Right slot (notifications + user menu). */
  end?: React.ReactNode
}

const Topbar = forwardRef<HTMLElement, TopbarProps>(
  ({ className, start, center, end, children, ...props }, ref) => (
    <header
      ref={ref}
      className={cn(
        "sticky top-0 z-30 flex h-14 w-full items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur",
        className,
      )}
      {...props}
    >
      {start ? <div className="flex items-center gap-2">{start}</div> : null}
      {center ? <div className="mx-2 hidden flex-1 justify-center sm:flex">{center}</div> : null}
      {end ? (
        <div className="ml-auto flex items-center gap-2">{end}</div>
      ) : (
        <div className="ml-auto" />
      )}
      {children}
    </header>
  ),
)
Topbar.displayName = "Topbar"

export { Topbar }
