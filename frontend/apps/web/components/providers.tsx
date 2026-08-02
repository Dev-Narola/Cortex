/**
 * Providers — composes every React provider the app needs.
 *
 * **F0 scope:** ThemeProvider (next-themes), QueryClientProvider
 * (TanStack Query), ToastProvider (shadcn/ui), ViewTransitions.
 *
 * The order matters:
 *   1. ThemeProvider must be outermost so its `class` attribute is
 *      on `<html>` before any child mounts.
 *   2. QueryClientProvider is a peer of every data-fetching component.
 *   3. ToastProvider sits at the root so any component can `useToast`.
 *   4. ViewTransitionProvider wraps the theme-switch in
 *      document.startViewTransition (Stage 4 of the UX doc).
 *
 * **Out of F0 scope (added by later phases):**
 *   - `UrqlProvider` for /graph queries — added in F6
 *   - `AuthProvider` for session hydration — added in F2
 *   - `PostHogProvider` for analytics — added in F10
 *
 * The list is intentionally short now. F0 is infrastructure only;
 * feature providers are added when their feature is built.
 */

"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { ThemeProvider } from "next-themes"
import { type ReactNode, useState } from "react"

import { ToastProvider, ToastViewport } from "@cortex/ui"

import { ViewTransitions } from "@/lib/theme/view-transitions"

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  )

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <ViewTransitions>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            {children}
            <ToastViewport />
          </ToastProvider>
          {process.env.NODE_ENV === "development" && <ReactQueryDevtools initialIsOpen={false} />}
        </QueryClientProvider>
      </ViewTransitions>
    </ThemeProvider>
  )
}
