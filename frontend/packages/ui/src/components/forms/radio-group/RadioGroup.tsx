/**
 * RadioGroup — accessible single-select group of options.
 *
 * **F1 scope (Task 16).** Built on Radix so the roving-tab
 * keyboard contract (arrow keys move between items, Tab
 * leaves the group) works for free. The styling is Cortex.
 *
 * **Layout.** `orientation="vertical"` (default) or
 * `orientation="horizontal"`. The container uses flex
 * `flex-col` / `flex-row` accordingly; per-item spacing is
 * the design system's `gap-3` / `gap-6`.
 *
 * **Sub-components.** `<RadioGroupItem>` is the individual
 * radio button. Pair it with `<Label>` for an accessible
 * radio (the label is the click target, the indicator is
 * the visual feedback).
 *
 * **Ref forwarding.** The forwarded `ref` lands on the
 * underlying `<button>` (Radix renders radios as buttons
 * for accessibility).
 */

"use client"

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group"
import { Circle } from "lucide-react"
import { type ComponentPropsWithoutRef, type ElementRef, forwardRef } from "react"

import { cn } from "../../../utils/cn"

const RadioGroup = forwardRef<
  ElementRef<typeof RadioGroupPrimitive.Root>,
  ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <RadioGroupPrimitive.Root
    ref={ref}
    className={cn("grid gap-3", orientation === "horizontal" && "flex flex-row gap-6", className)}
    orientation={orientation}
    {...props}
  />
))
RadioGroup.displayName = "RadioGroup"

const RadioGroupItem = forwardRef<
  ElementRef<typeof RadioGroupPrimitive.Item>,
  ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    className={cn(
      "aspect-square h-4 w-4 rounded-full border border-ink-300 text-ink-900",
      "ring-offset-background",
      "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "data-[state=checked]:border-ink-900",
      className,
    )}
    {...props}
  >
    <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
      <Circle className="h-2 w-2 fill-current text-current" />
    </RadioGroupPrimitive.Indicator>
  </RadioGroupPrimitive.Item>
))
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName

export { RadioGroup, RadioGroupItem }
