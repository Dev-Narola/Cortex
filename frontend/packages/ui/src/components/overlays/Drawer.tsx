/**
 * Drawer — side-anchored sheet built on Radix Dialog.
 *
 * **F1 Part 3 (Task 23).** Side-aware sheet for mobile
 * navigation, filter panels, and inline settings. Supports
 * four sides: `left | right | top | bottom`.
 *
 * **Why Radix Dialog + custom transforms?** Radix's
 * `DialogContent` is a centred modal by default. We
 * override it with side-specific translate/scale
 * transforms so the surface slides in from the right
 * (or top / bottom / left) instead of fading in the
 * middle.
 *
 * **Swipe-ready.** The transform-based animation is the
 * same shape a gesture library (framer-motion's drag,
 * use-gesture, etc.) would animate; F2+ can swap in a
 * physics-based drag without changing the component
 * API.
 *
 * **Used by.** Mobile navigation, filter side-panels,
 * settings sheets, document detail inspector.
 */

"use client"

import * as DialogPrimitive from "@radix-ui/react-dialog"
import { type VariantProps, cva } from "class-variance-authority"
import { type ComponentPropsWithoutRef, type ElementRef, forwardRef } from "react"

import { cn } from "../../utils/cn"

const Drawer = DialogPrimitive.Root
const DrawerTrigger = DialogPrimitive.Trigger
const DrawerPortal = DialogPrimitive.Portal
const DrawerClose = DialogPrimitive.Close

export type DrawerSide = "left" | "right" | "top" | "bottom"

const drawerOverlayVariants = cva("fixed inset-0 z-50 bg-ink-950/60 backdrop-blur-sm", {
  variants: {
    side: {
      left: "",
      right: "",
      top: "",
      bottom: "",
    },
  },
  defaultVariants: {
    side: "right",
  },
})

const drawerContentVariants = cva(
  "fixed z-50 gap-4 bg-background shadow-2xl border-border flex flex-col",
  {
    variants: {
      side: {
        left: "inset-y-0 left-0 h-full w-3/4 max-w-sm border-r",
        right:
          "inset-y-0 right-0 h-full w-3/4 max-w-sm border-l data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
        top: "inset-x-0 top-0 w-full max-h-[80vh] border-b",
        bottom: "inset-x-0 bottom-0 w-full max-h-[80vh] border-t",
      },
    },
    compoundVariants: [
      {
        side: "left",
        className: "data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left",
      },
      {
        side: "right",
        className: "data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
      },
      {
        side: "top",
        className: "data-[state=open]:slide-in-from-top data-[state=closed]:slide-out-to-top",
      },
      {
        side: "bottom",
        className: "data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
      },
    ],
    defaultVariants: {
      side: "right",
    },
  },
)

export type DrawerContentVariantProps = VariantProps<typeof drawerContentVariants>

export interface DrawerContentProps
  extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    DrawerContentVariantProps {
  /** Custom max-width override (e.g. `"max-w-md"` for a wide inspector). */
  widthClassName?: string
}

const DrawerContent = forwardRef<ElementRef<typeof DialogPrimitive.Content>, DrawerContentProps>(
  ({ className, children, side, widthClassName, ...props }, ref) => (
    <DrawerPortal>
      <DialogPrimitive.Overlay
        className={cn(
          drawerOverlayVariants({ side }),
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        )}
      />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(drawerContentVariants({ side }), "duration-300", widthClassName, className)}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DrawerPortal>
  ),
)
DrawerContent.displayName = "DrawerContent"

const DrawerHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 p-6 pb-2 text-left", className)} {...props} />
)
DrawerHeader.displayName = "DrawerHeader"

const DrawerTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
))
DrawerTitle.displayName = "DrawerTitle"

const DrawerDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DrawerDescription.displayName = "DrawerDescription"

const DrawerBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex-1 overflow-y-auto px-6 py-2", className)} {...props} />
)
DrawerBody.displayName = "DrawerBody"

const DrawerFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse gap-2 border-t border-border p-6 pt-4 sm:flex-row sm:justify-end sm:space-x-2",
      className,
    )}
    {...props}
  />
)
DrawerFooter.displayName = "DrawerFooter"

export {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  drawerContentVariants,
}
