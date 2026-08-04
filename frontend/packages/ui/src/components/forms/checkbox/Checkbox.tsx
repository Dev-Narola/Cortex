/**
 * Checkbox — accessible boolean control.
 *
 * **F1 scope (Task 15).** Built on Radix so the
 * indeterminate state, focus trap escape, and form
 * integration all work for free. The styling is Cortex,
 * the a11y contract is Radix's.
 *
 * **States.** `checked` / `unchecked` / `indeterminate`.
 * The indeterminate state is for "some but not all" use
 * cases (e.g. a "select all" parent checkbox) — pass
 * `checked="indeterminate"`.
 *
 * **Keyboard.** Space toggles. Tab moves focus. Radix
 * handles the rest.
 *
 * **Ref forwarding.** The forwarded `ref` lands on the
 * underlying `<button>` (Radix renders the checkbox as a
 * button for accessibility).
 */

"use client"

import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check, Minus } from "lucide-react"
import { type ComponentPropsWithoutRef, type ElementRef, forwardRef } from "react"

import { cn } from "../../../utils/cn"
import { type CheckboxVariantProps, checkboxVariants } from "./checkbox.variants"

const Checkbox = forwardRef<
  ElementRef<typeof CheckboxPrimitive.Root>,
  ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> & CheckboxVariantProps
>(({ className, size, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(checkboxVariants({ size }), className)}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      {props.checked === "indeterminate" ? (
        <Minus className="h-3 w-3" />
      ) : (
        <Check className="h-3 w-3" />
      )}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = "Checkbox"

export { Checkbox }
