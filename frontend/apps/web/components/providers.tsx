/**
 * Providers — the application's root provider tree.
 *
 * **F0 scope (Task 17).** Composes the four providers every
 * Cortex screen relies on:
 *
 *   1. `ThemeProvider` (next-themes) — outermost. The `class`
 *      attribute on `<html>` is what `.dark` in `tokens.css`
 *      keys off, so the theme must be applied before any child
 *      reads a token.
 *   2. `QueryProvider` (TanStack Query) — owns the `QueryClient`
 *      and devtools. Created by `lib/query/client.ts`; mounted
 *      by `lib/query/provider.tsx`. Pulled out so the cache
 *      config and the dev-only debug UI can evolve independently
 *      of this file.
 *   3. `ToastProvider` (shadcn/ui) — the portal that surfaces
 *      `useToast()` from anywhere in the tree.
 *   4. `ViewTransitions` — wraps the theme toggle in
 *      `document.startViewTransition` for the GPU-accelerated
 *      light↔dark morph (Stage 4 of the UX doc).
 *
 * **Out of F0 scope (added by later phases):**
 *   - `UrqlProvider` for /graph queries — F6
 *   - `AuthProvider` for session hydration — F2
 *   - `PostHogProvider` for analytics — F10
 *
 * The order is not arbitrary. Don't reorder.
 */

"use client"

import { ThemeProvider } from "next-themes"
import type { ReactNode } from "react"

import { ToastProvider, ToastViewport, Toaster } from "@cortex/ui"

import { QueryProvider } from "@/lib/query/provider"
import { ViewTransitions } from "@/lib/theme/view-transitions"

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <ViewTransitions>
        <QueryProvider>
          <ToastProvider>
            {children}
            <Toaster />
            <ToastViewport />
          </ToastProvider>
        </QueryProvider>
      </ViewTransitions>
    </ThemeProvider>
  )
}
