/**
 * Theme switcher — Light / Dark / System.
 *
 * next-themes persists the choice in localStorage ("theme") and injects a
 * pre-paint script, so the stored theme applies before first paint (no flash).
 * "System" follows `prefers-color-scheme` live. Changes go through the view
 * transition helper, which is a no-op under reduced motion or without support.
 */

"use client"

import { Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@cortex/ui"

import { useViewTransitions } from "@/lib/theme/view-transitions"

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const

type ThemeChoice = (typeof OPTIONS)[number]["value"]

export function ThemeToggle() {
  const { theme, resolvedTheme } = useTheme()
  const { setAnimatedTheme } = useViewTransitions()
  // The stored theme is only known on the client; render a neutral icon until mounted.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const current = (mounted ? theme : undefined) as ThemeChoice | undefined
  const TriggerIcon = !mounted ? Sun : resolvedTheme === "dark" ? Moon : Sun

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Theme: ${current ? OPTIONS.find((o) => o.value === current)?.label : "loading"}`}
        >
          <TriggerIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          Appearance
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={current ?? ""}
          onValueChange={(v) => setAnimatedTheme(v as ThemeChoice)}
        >
          {OPTIONS.map(({ value, label, icon: ItemIcon }) => (
            <DropdownMenuRadioItem key={value} value={value} className="gap-2">
              <ItemIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
