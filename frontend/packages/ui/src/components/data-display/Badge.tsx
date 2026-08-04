/**
 * Badge — small status / count indicator.
 *
 * **F1 scope (Task 19).** Used for document status, agent
 * status, MCP session status, API key status, billing alerts —
 * every "the system is telling you about a thing" surface.
 *
 * **Generic on purpose.** No business-specific colour
 * vocabulary lives here; the variant names are the
 * abstract tokens (success / warning / error / info), and
 * the app maps its domain states to those tokens at the call
 * site:
 *
 *   <Badge tone="success">Indexed</Badge>      // F3 document state
 *   <Badge tone="warning">Degraded</Badge>      // platform health
 *
 * **Variants.** `default`, `secondary`, `success`, `warning`,
 * `error`, `outline`. The F1 spec's "success / warning / error"
 * replace the previous V9 health-mapping aliases
 * (`healthy` / `degraded` / `unhealthy`) — those are still
 * available as aliases for backward-compat.
 *
 * **Sizes.** `sm`, `md`, `lg` — three points so badges can
 * sit inline with text (sm), stand alone on a card (md), or
 * be a prominent status pill (lg).
 */

import { type VariantProps, cva } from "class-variance-authority"
import { type HTMLAttributes, forwardRef } from "react"

import { cn } from "../../utils/cn"

export const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-ink-900 text-paper-50",
        secondary: "border-transparent bg-muted text-foreground",
        success: "border-transparent bg-success/15 text-success",
        warning: "border-transparent bg-warning/15 text-warning",
        error: "border-transparent bg-destructive/15 text-destructive",
        outline: "text-foreground",
        // V9 ingestion-state aliases (consumed by the F3 document list).
        pending: "border-transparent bg-cloud-200 text-ink-700",
        processing: "border-transparent bg-volt-200 text-volt-900",
        completed: "border-transparent bg-success/15 text-success",
        failed: "border-transparent bg-destructive/15 text-destructive",
        // V9 health-mapping aliases (consumed by the platform status pill).
        healthy: "border-transparent bg-success/15 text-success",
        degraded: "border-transparent bg-warning/15 text-warning",
        unhealthy: "border-transparent bg-destructive/15 text-destructive",
      },
      size: {
        sm: "h-5 px-1.5 text-[10px]",
        md: "h-6 px-2.5 text-xs",
        lg: "h-7 px-3 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
)

export type BadgeVariantProps = VariantProps<typeof badgeVariants>

export interface BadgeProps extends HTMLAttributes<HTMLDivElement>, BadgeVariantProps {}

const Badge = forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, size, ...props }, ref) => (
    <div ref={ref} className={cn(badgeVariants({ variant, size, className }))} {...props} />
  ),
)
Badge.displayName = "Badge"

export { Badge }
