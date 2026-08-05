/**
 * Grid — responsive column grid.
 *
 * **F1 Part 4 (Task 36).** A 12-column grid that maps
 * to the Tailwind v4 container queries. Default
 * responsive columns:
 *   - mobile (default): 1 col
 *   - sm:  2 cols
 *   - md:  3 cols
 *   - lg:  4 cols
 *   - xl:  4 cols
 *
 * **Custom columns.** Pass `cols` to override. The shape
 * is `{ base?, sm?, md?, lg?, xl? }` — each value is the
 * number of columns at that breakpoint. Missing
 * breakpoints fall back to the previous one.
 *
 * **Gap.** `gap-4` by default. Override via `gap`.
 */

import type { CSSProperties, HTMLAttributes, ReactNode } from "react"

import { cn } from "../../utils/cn"

const COLS_CLASS = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
  7: "grid-cols-7",
  8: "grid-cols-8",
  9: "grid-cols-9",
  10: "grid-cols-10",
  11: "grid-cols-11",
  12: "grid-cols-12",
} as const

export type GridColumns = keyof typeof COLS_CLASS

export interface ResponsiveColumns {
  base?: GridColumns
  sm?: GridColumns
  md?: GridColumns
  lg?: GridColumns
  xl?: GridColumns
}

const DEFAULT_COLS: ResponsiveColumns = {
  base: 1,
  sm: 2,
  md: 3,
  lg: 4,
  xl: 4,
}

const buildClass = (cols: ResponsiveColumns): string => {
  const parts: string[] = []
  const breakpoints: Array<keyof ResponsiveColumns> = ["base", "sm", "md", "lg", "xl"]
  for (const bp of breakpoints) {
    const v = cols[bp]
    if (v === undefined) continue
    const cls = COLS_CLASS[v]
    if (bp === "base") parts.push(cls)
    else parts.push(`${bp}:${cls}`)
  }
  return parts.join(" ")
}

const GAP_CLASS = {
  none: "gap-0",
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
  xl: "gap-8",
} as const

export type GridGap = keyof typeof GAP_CLASS

export interface GridProps extends HTMLAttributes<HTMLDivElement> {
  cols?: ResponsiveColumns
  gap?: GridGap
  children?: ReactNode
}

const Grid = ({ className, cols = DEFAULT_COLS, gap = "md", children, ...props }: GridProps) => (
  <div
    className={cn("grid", GAP_CLASS[gap], buildClass(cols), className)}
    {...(props as { style?: CSSProperties })}
  >
    {children}
  </div>
)
Grid.displayName = "Grid"

export { Grid }
