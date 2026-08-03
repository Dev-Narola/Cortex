/**
 * Icon — single entry point for every icon in the app.
 *
 * **F1 scope (Task 9).** Wraps `lucide-react` with the design
 * system's defaults (1.75 px stroke, currentColor for theme
 * inheritance) and the four canonical sizes (xs/sm/md/lg).
 *
 * **Why a wrapper?** Three reasons:
 *   1. **Single point of truth.** A future redesign changes
 *      `strokeWidth` here once, not in 200 files.
 *   2. **Accessibility by default.** `<Icon>` always sets
 *      `aria-hidden` when the icon is decorative (the common
 *      case). For meaningful icons, set `label="..."` and the
 *      component switches to `role="img"` + `aria-label`.
 *   3. **Type safety.** The `name` prop is a literal union of
 *      every icon we use; a typo at the call site fails
 *      `tsc`, not at runtime in production.
 *
 * **Usage:**
 *   <Icon name="Check" />                         // decorative, default md
 *   <Icon name="Trash" size="sm" tone="destructive" />
 *   <Icon name="Info" label="More information" />  // announces to AT
 */

import { type IconNode, type LucideIcon, icons } from "lucide-react"
import { type SVGProps, forwardRef } from "react"

import { cn } from "../utils/cn"

const ICON_SIZES = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
} as const

const ICON_STROKE = 1.75

const ICON_TONES = {
  default: "text-foreground",
  muted: "text-muted-foreground",
  inverse: "text-paper-50",
  accent: "text-ember-600",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
} as const

export type IconName = keyof typeof icons
export type IconSize = keyof typeof ICON_SIZES
export type IconTone = keyof typeof ICON_TONES

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  /** Lucide icon name (e.g. `"Check"`, `"ArrowRight"`). */
  name: IconName
  /** Default `md`. Pick from the canonical size scale. */
  size?: IconSize
  /** Stroke override. Defaults to the brand default (1.75). */
  strokeWidth?: number
  /** Theme-aware colour. Defaults to `default` (foreground). */
  tone?: IconTone
  /**
   * Accessible label. When set, the icon is announced to
   * screen readers; when omitted, the icon is `aria-hidden`
   * (decorative).
   */
  label?: string
}

/**
 * `IconNode` is the upstream lucide-react type for the SVG
 * children. We strip the `name` field from the lookup so the
 * call-site can override the colour / size freely.
 */
function pickIcon(name: IconName): LucideIcon {
  return icons[name]
}

const Icon = forwardRef<SVGSVGElement, IconProps>(
  (
    { name, size = "md", strokeWidth = ICON_STROKE, tone = "default", label, className, ...props },
    ref,
  ) => {
    const Component: LucideIcon = pickIcon(name)
    const a11y = label
      ? ({ role: "img", "aria-label": label } as const)
      : ({ "aria-hidden": true, focusable: false } as const)
    return (
      <Component
        ref={ref}
        size={ICON_SIZES[size]}
        strokeWidth={strokeWidth}
        className={cn(ICON_TONES[tone], "shrink-0", className)}
        {...a11y}
        {...props}
      />
    )
  },
)
Icon.displayName = "Icon"

export { Icon }
export type { IconNode, LucideIcon }
