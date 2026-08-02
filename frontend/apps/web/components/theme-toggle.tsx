/**
 * Theme toggle — switches dark / light with a view transition.
 *
 * Stage 4 of the UX doc: "the one place the theme itself is
 * allowed to be the animation." The view transition is
 * triggered inside the provider; this button just calls
 * `setAnimatedTheme()`.
 */

"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { useViewTransitions } from "@/lib/theme/view-transitions"
import { Button } from "@cortex/ui"

export function ThemeToggle() {
  const { resolvedTheme } = useTheme()
  const { setAnimatedTheme } = useViewTransitions()
  const isDark = resolvedTheme === "dark"
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      onClick={() => setAnimatedTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  )
}
