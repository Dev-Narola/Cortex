/**
 * (marketing) route group — light theme, public pages.
 *
 * **F0 + F2 Part 2 (Task 18).** Public pages (landing,
 * pricing, login, register, forgot-password, reset-password,
 * workspace-setup) share this layout. The light theme is
 * the marketing palette.
 *
 * **Forces the theme to "light".** Without this, every
 * page in the (marketing) group would render dark
 * (because the global default theme is dark — set up
 * in `Providers`). The forced-light on mount here is
 * the first half of the light → dark transition that
 * fires when the user crosses into the (app) layout
 * after onboarding.
 *
 * **Theme transition (F2 Part 2).** When the user signs
 * up + creates a workspace + navigates to `/app/dashboard`,
 * the (app) layout's mount effect calls `setAnimatedTheme`
 * (`document.startViewTransition`) which smoothly morphs
 * the body background + text colour from light → dark.
 *
 * **No business logic.** Layout only.
 */

"use client"

import { useTheme } from "next-themes"
import { useEffect } from "react"

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { setTheme } = useTheme()

  // Force the light theme on mount. The (app) layout will
  // switch back to "dark" via the animated transition.
  useEffect(() => {
    setTheme("light")
  }, [setTheme])

  return (
    <div
      data-theme="light"
      className="flex min-h-screen flex-col bg-background text-foreground"
    >
      {/* TODO: marketing nav with /login + /pricing links */}
      <main className="flex-1">{children}</main>
      {/* TODO: marketing footer */}
    </div>
  )
}
