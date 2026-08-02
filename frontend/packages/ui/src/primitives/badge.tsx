/**
 * Badge — small status / count indicator.
 *
 * Used heavily by the document list (pending / parsing / indexed
 * / failed) and the agent runs. The colour vocabulary maps to
 * the V9 platform `health` enum: healthy = success, degraded =
 * warning, unhealthy = destructive.
 */

import { type VariantProps, cva } from "class-variance-authority"
import { type HTMLAttributes, forwardRef } from "react"
import { cn } from "../utils/cn"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-ink-900 text-paper-50",
        secondary: "border-transparent bg-muted text-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        success: "border-transparent bg-success/15 text-success",
        warning: "border-transparent bg-warning/15 text-warning",
        outline: "text-foreground",
        // V9 health mapping
        healthy: "border-transparent bg-success/15 text-success",
        degraded: "border-transparent bg-warning/15 text-warning",
        unhealthy: "border-transparent bg-destructive/15 text-destructive",
        // V9 ingestion states
        pending: "border-transparent bg-cloud-200 text-ink-700",
        processing: "border-transparent bg-volt-200 text-volt-900",
        completed: "border-transparent bg-success/15 text-success",
        failed: "border-transparent bg-destructive/15 text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

export interface BadgeProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = forwardRef<HTMLDivElement, BadgeProps>(({ className, variant, ...props }, ref) => (
  <div ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
))
Badge.displayName = "Badge"

export { Badge, badgeVariants }
