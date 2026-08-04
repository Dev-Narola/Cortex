/**
 * SidebarItem — a single nav row.
 *
 * **F1 Part 3 (Task 27).** Visual row in the sidebar. Pair
 * with `next/link` via the `asChild` pattern to make it
 * a real anchor (the parent `next/link` slots itself as
 * the child of `SidebarItem`).
 *
 * **States.** `default | active | disabled`.
 *   - `active` paints the row with the brand-tinted
 *     background + a left edge bar.
 *   - `disabled` is for permission-gated items the user
 *     doesn't have access to.
 *
 * **Icon + label.** `iconLeft` is a lucide icon (or any
 * node); `children` is the label. When the parent
 * `Sidebar` is `collapsed`, the label is hidden and the
 * icon centres itself.
 *
 * **asChild.** When `asChild` is true, the caller passes
 * a single React element (typically `next/link`) as the
 * children; the SidebarItem's styles are merged onto the
 * slotted child via Radix Slot. The iconLeft / label /
 * iconRight layout lives inside the slotted child.
 */

import { Slot } from "@radix-ui/react-slot"
import { type HTMLAttributes, forwardRef } from "react"

import { cn } from "../../utils/cn"

export type SidebarItemState = "default" | "active" | "disabled"

const STATE = {
  default: "text-muted-foreground hover:bg-muted hover:text-foreground",
  active: "bg-ember-500/10 text-ember-700 dark:text-ember-300",
  disabled: "opacity-50 pointer-events-none",
} as const

export interface SidebarItemProps extends HTMLAttributes<HTMLAnchorElement> {
  /** Default `default`. */
  state?: SidebarItemState
  /** Default `false`. Set `true` to render a `next/link` child as the anchor. */
  asChild?: boolean
  /** Left-aligned icon (lucide node). */
  iconLeft?: React.ReactNode
  /** Optional right-aligned badge (count, "new" pill, etc.). */
  iconRight?: React.ReactNode
}

const SidebarItem = forwardRef<HTMLAnchorElement, SidebarItemProps>(
  (
    { className, state = "default", asChild = false, iconLeft, iconRight, children, ...props },
    ref,
  ) => {
    const classNames = cn(
      "group relative flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      STATE[state],
      className,
    )

    if (asChild) {
      // Slot requires a single React element child. The caller
      // composes the icon + label inside the slotted element.
      return (
        <Slot
          ref={ref as never}
          data-state={state}
          aria-current={state === "active" ? "page" : undefined}
          className={classNames}
          {...props}
        >
          {children}
        </Slot>
      )
    }

    return (
      <a
        ref={ref}
        data-state={state}
        aria-current={state === "active" ? "page" : undefined}
        className={classNames}
        {...props}
      >
        {iconLeft ? (
          <span className="shrink-0" aria-hidden>
            {iconLeft}
          </span>
        ) : null}
        <span className="flex-1 truncate">{children}</span>
        {iconRight ? (
          <span className="shrink-0" aria-hidden>
            {iconRight}
          </span>
        ) : null}
      </a>
    )
  },
)
SidebarItem.displayName = "SidebarItem"

export { SidebarItem }
