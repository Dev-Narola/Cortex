/**
 * Tabs — accessible tabbed interface built on Radix.
 *
 * **F1 Part 3 (Task 24).** Used by Settings (General / Team /
 * API Keys / Billing), the document detail page, and the
 * agent inspector.
 *
 * **Orientations.**
 *   - `horizontal` (default) — triggers in a single row, content
 *     stacks below.
 *   - `vertical` — triggers stack in a left column, content sits
 *     to the right. Used by the Settings panel.
 *
 * **Keyboard nav.** Radix provides:
 *   - `Tab` / `Shift+Tab` — focus into / out of the tab list.
 *   - `←` / `→` (or `↑` / `↓` for vertical) — move between triggers.
 *   - `Home` / `End` — jump to first / last trigger.
 *   - `Space` / `Enter` — activate the focused trigger.
 *
 * **Activation mode.** `automatic` (default) — arrow keys
 * activate as you move. Pass `activationMode="manual"` to require
 * `Space` / `Enter` (useful for tabs that mount expensive content).
 *
 * **Compound API.** `Tabs` is the root; pair it with `TabsList`,
 * `TabsTrigger`, and `TabsContent` to compose a tabbed view.
 */

"use client"

import * as TabsPrimitive from "@radix-ui/react-tabs"
import { type ComponentPropsWithoutRef, type ElementRef, forwardRef } from "react"

import { cn } from "../../utils/cn"

const Tabs = TabsPrimitive.Root

const TabsList = forwardRef<
  ElementRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
      "data-[orientation=vertical]:flex-col data-[orientation=vertical]:h-auto data-[orientation=vertical]:w-48 data-[orientation=vertical]:items-stretch",
      className,
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = forwardRef<
  ElementRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      "disabled:pointer-events-none disabled:opacity-50",
      "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
      "data-[orientation=vertical]:w-full data-[orientation=vertical]:justify-start data-[orientation=vertical]:text-left",
      className,
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = forwardRef<
  ElementRef<typeof TabsPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      "data-[orientation=vertical]:mt-0 data-[orientation=vertical]:ml-2",
      className,
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsContent, TabsList, TabsTrigger }
