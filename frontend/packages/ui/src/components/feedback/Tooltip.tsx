/**
 * Tooltip — accessible hover/focus hint.
 *
 * **F1 scope (Task 11 supporting).** Built on Radix's Tooltip
 * primitive so keyboard focus, dismiss on Escape, and
 * collision-aware positioning all come for free.
 *
 * **Delay.** Default 200ms — long enough to avoid flashing on
 * mouse-move, short enough to feel instant on intent. Pass
 * `delayDuration={0}` for a hint that should appear
 * immediately.
 *
 * **Theme integration.** Surface uses `bg-ink-900 text-paper-50`
 * — both tokens, both flip on the dark-theme selector.
 *
 * **Usage.**
 *   <Tooltip content="Copy to clipboard">
 *     <Button iconLeft={<Copy />}>Copy</Button>
 *   </Tooltip>
 */

"use client"

import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { type ComponentPropsWithoutRef, type ElementRef, forwardRef } from "react"

import { cn } from "../../utils/cn"

const TooltipProvider = TooltipPrimitive.Provider
const Tooltip = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = forwardRef<
  ElementRef<typeof TooltipPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 overflow-hidden rounded-md border border-border bg-ink-900 px-3 py-1.5 text-xs text-paper-50 shadow-md",
        "data-[state=delayed-open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0",
        "data-[state=closed]:zoom-out-95 data-[state=delayed-open]:zoom-in-95",
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export interface TooltipRootProps extends ComponentPropsWithoutRef<typeof Tooltip> {
  /** The trigger element (must accept a ref). */
  children: React.ReactNode
  /** Tooltip body. */
  content: React.ReactNode
  /** Delay before the tooltip opens, in ms. Default 200. */
  delayDuration?: number
  /** Side. Default `top`. */
  side?: "top" | "right" | "bottom" | "left"
}

/**
 * Convenience wrapper around the Radix tooltip primitives.
 * Wraps the trigger in a `<TooltipProvider>` automatically so
 * single-use call-sites don't need to mount one at the root.
 */
const TooltipRoot = forwardRef<ElementRef<typeof TooltipContent>, TooltipRootProps>(
  ({ children, content, delayDuration = 200, side = "top", ...props }, ref) => (
    <TooltipProvider delayDuration={delayDuration}>
      <Tooltip {...props}>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent ref={ref} side={side}>
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
)
TooltipRoot.displayName = "TooltipRoot"

export { Tooltip, TooltipContent, TooltipProvider, TooltipRoot, TooltipTrigger }
