/**
 * UserMenu — the avatar + dropdown for the current user.
 *
 * **F1 Part 3 (Task 27).** Built on the `DropdownMenu`
 * primitive. The trigger is an `Avatar` (image +
 * initials fallback). The content is generic — the
 * caller passes a list of items + a footer slot for
 * "Sign out" / tenant switcher / etc.
 *
 * **Used by.** The topbar (right slot) and the
 * `SidebarFooter`.
 *
 * **No business logic.** The user object (name, email,
 * image URL) is passed via props; F1 doesn't read it
 * from a global store. The call site wires the data.
 */

"use client"

import { type ComponentPropsWithoutRef, type ReactNode, forwardRef } from "react"

import { cn } from "../../utils/cn"
import { Avatar } from "../data-display/Avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../overlays/DropdownMenu"

export interface UserMenuItem extends ComponentPropsWithoutRef<typeof DropdownMenuItem> {
  /** Optional icon rendered at the start. */
  iconLeft?: ReactNode
  /** Optional shortcut label rendered at the end. */
  shortcut?: string
}

export interface UserMenuProps {
  /** Display name (passed to Avatar as the `name` fallback). */
  name?: string
  /** Email shown in the dropdown header. */
  email?: string
  /** Image URL passed to `Avatar.src`. */
  src?: string
  /** Menu items. */
  items?: UserMenuItem[]
  /** Optional footer slot (e.g. a "Sign out" item). */
  footer?: ReactNode
  /** Custom trigger (defaults to an `Avatar`). */
  trigger?: ReactNode
  /** Side of the menu. Default `bottom`. */
  side?: "top" | "right" | "bottom" | "left"
  className?: string
}

const UserMenu = forwardRef<HTMLButtonElement, UserMenuProps>(
  ({ name, email, src, items, footer, trigger, side = "bottom", className }, ref) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <button
            ref={ref}
            type="button"
            aria-label={name ? `Open user menu for ${name}` : "Open user menu"}
            className={cn(
              "rounded-full ring-offset-background transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              className,
            )}
          >
            <Avatar src={src} name={name} size="sm" />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="end" className="min-w-[14rem]">
        {(name || email) && (
          <>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                {name ? (
                  <p className="text-sm font-medium leading-none text-foreground">{name}</p>
                ) : null}
                {email ? (
                  <p className="text-xs leading-none text-muted-foreground">{email}</p>
                ) : null}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        {items?.map((item, idx) => {
          // Stable key — `UserMenuItem` may not have a unique id; fall
          // back to a content hash + index so React can still reconcile.
          const stableKey =
            (typeof item.children === "string" ? item.children : null) ?? `item-${idx}`
          return (
            <DropdownMenuItem
              key={stableKey}
              iconLeft={item.iconLeft}
              shortcut={item.shortcut}
              tone={item.tone}
              onSelect={item.onSelect}
              disabled={item.disabled}
            >
              {item.children}
            </DropdownMenuItem>
          )
        })}
        {footer ? (
          <>
            <DropdownMenuSeparator />
            {footer}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  ),
)
UserMenu.displayName = "UserMenu"

export { UserMenu }
