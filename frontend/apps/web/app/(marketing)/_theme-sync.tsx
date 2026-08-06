/**
 * MarketingThemeSync — the React-side mirror of the
 * pre-paint script in `layout.tsx`.
 *
 * The script in `layout.tsx` runs before paint to strip
 * the `dark` class from `<html>`. After hydration, this
 * tiny client island tells next-themes "the theme is
 * light" so the next route navigation stays consistent
 * (next-themes reads from `localStorage` and re-applies
 * the class on each navigation).
 *
 * No DOM mutation here — we only talk to next-themes.
 */

"use client"

import { useTheme } from "next-themes"
import { useEffect } from "react"

export function MarketingThemeSync() {
  const { setTheme } = useTheme()
  useEffect(() => {
    setTheme("light")
  }, [setTheme])
  return null
}
