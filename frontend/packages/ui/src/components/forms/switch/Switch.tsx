/**
 * Switch — accessible boolean control.
 *
 * **F1 scope (Task 17).** Built on Radix for keyboard
 * accessibility (Space toggles, no focus trap issues).
 *
 * **Animation.** Simple thumb transition only — no spring
 * physics, no elaborate motion. The user is signalling
 * intent; the animation should be instant feedback, not
 * theatre.
 *
 * **Loading state.** The `loading` prop dims the switch
 * and shows a tiny spinner inside the thumb, so a settings
 * page can disable interaction while a save is in flight
 * without the switch going blank.
 *
 * **Sizes.** `sm` (28×16), `md` (44×24, default), `lg` (56×30).
 *
 * **Theme integration.** Track uses `bg-input` (off) and
 * `bg-ink-900` (on). Both tokens flip on the dark-theme
 * selector.
 */

"use client"

import * as SwitchPrimitive from "@radix-ui/react-switch"
import { type ComponentPropsWithoutRef, type ElementRef, forwardRef } from "react"

import { cn } from "../../../utils/cn"
import { Spinner } from "../../feedback/Spinner"

const SIZES = {
  sm: {
    track: "h-4 w-7",
    thumb: "h-3 w-3 data-[state=checked]:translate-x-3",
    offset: "data-[state=checked]:translate-x-3",
  },
  md: {
    track: "h-6 w-11",
    thumb: "h-5 w-5 data-[state=checked]:translate-x-5",
    offset: "data-[state=checked]:translate-x-5",
  },
  lg: {
    track: "h-7 w-14",
    thumb: "h-6 w-6 data-[state=checked]:translate-x-7",
    offset: "data-[state=checked]:translate-x-7",
  },
} as const

export type SwitchSize = keyof typeof SIZES

export interface SwitchProps extends ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> {
  /** Show a spinner inside the thumb while a save is in flight. */
  loading?: boolean
  /** Default `md`. */
  size?: SwitchSize
}

const Switch = forwardRef<ElementRef<typeof SwitchPrimitive.Root>, SwitchProps>(
  ({ className, size = "md", loading = false, disabled, ...props }, ref) => {
    const s = SIZES[size]
    return (
      <SwitchPrimitive.Root
        ref={ref}
        disabled={disabled || loading || undefined}
        data-loading={loading || undefined}
        className={cn(
          "peer inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent",
          "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "data-[state=checked]:bg-ink-900 data-[state=unchecked]:bg-input",
          s.track,
          className,
        )}
        {...props}
      >
        <SwitchPrimitive.Thumb
          className={cn(
            "pointer-events-none flex items-center justify-center rounded-full bg-background shadow-lg ring-0 transition-transform",
            "data-[state=checked]:translate-x-0 data-[state=unchecked]:translate-x-0",
            s.thumb,
          )}
        >
          {loading ? (
            <span aria-hidden="true" className="flex items-center justify-center">
              <Spinner size="sm" />
            </span>
          ) : null}
        </SwitchPrimitive.Thumb>
      </SwitchPrimitive.Root>
    )
  },
)
Switch.displayName = "Switch"

export { Switch }
