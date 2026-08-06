/**
 * (marketing) route group — light theme, public pages.
 *
 * **F0 + F2 Part 2 (Task 18).** Public pages (landing,
 * pricing, login, register, forgot-password, reset-password,
 * workspace-setup) share this layout. The light theme is
 * the marketing palette.
 *
 * **No theme flash on first paint.** The default theme
 * is dark (set in `Providers`). Without intervention, every
 * (marketing) page would paint dark for one frame before
 * React hydrates and the `useEffect` flips it to light.
 * We pre-render a small inline `<script>` that runs
 * synchronously (before any paint) and strips the `dark`
 * class from `<html>` if the user hasn't explicitly
 * chosen dark. The `<MarketingThemeSync>` client island
 * then sets `localStorage` so the next navigation is
 * consistent.
 *
 * **Theme transition (F2 Part 2).** When the user signs
 * up + creates a workspace + navigates to `/app/dashboard`,
 * the (app) layout's mount effect calls `setAnimatedTheme`
 * (`document.startViewTransition`) which smoothly morphs
 * the body background + text colour from light → dark.
 *
 * **No business logic.** Layout only.
 */

import Script from "next/script"

import { MarketingThemeSync } from "./_theme-sync"

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      {/*
        Strip the `dark` class on <html> before paint, unless
        the user has explicitly persisted the `dark` theme in
        localStorage (the next-themes convention). Runs
        synchronously in the head so the first paint is the
        marketing (light) palette.
      */}
      <Script
        id="cortex-marketing-theme"
        strategy="beforeInteractive"
      >{`
        (function() {
          try {
            var stored = localStorage.getItem('cortex.theme');
            if (stored !== '"dark"' && stored !== '"system"') {
              document.documentElement.classList.remove('dark');
            }
          } catch (e) { /* localStorage unavailable; default to light */ }
        })();
      `}</Script>
      <MarketingThemeSync />
      <div
        data-theme="light"
        className="flex min-h-screen flex-col bg-background text-foreground"
      >
        {/* TODO: marketing nav with /login + /pricing links */}
        <main className="flex-1">{children}</main>
        {/* TODO: marketing footer */}
      </div>
    </>
  )
}
