/**
 * Providers — composes every React provider the app needs.
 *
 * The order matters:
 *   1. ThemeProvider (next-themes) — must be outermost so its
 *      `class` attribute is on `<html>` before any child mounts.
 *   2. QueryClientProvider — TanStack Query is a peer of every
 *      data-fetching component.
 *   3. UrqlProvider — the GraphQL client for /graph queries.
 *   4. Toaster — sits at the root so any component can `useToast`.
 *   5. ViewTransitionProvider — wraps the theme-switch in
 *      document.startViewTransition (Stage 4 of the UX doc).
 */

"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ThemeProvider } from "next-themes";
import { useState, type ReactNode } from "react";
import { Provider as UrqlProvider, Client, createClient } from "urql";
import { cacheExchange } from "@urql/exchange-graphcache";

import { ToastProvider, ToastViewport } from "@cortex/ui";
import { publicEnv } from "@cortex/config";

import { ViewTransitions } from "@/lib/theme/view-transitions";

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
  );

  const [urqlClient] = useState<Client>(() =>
    createClient({
      url: publicEnv.NEXT_PUBLIC_GRAPHQL_URL,
      exchanges: [cacheExchange()],
    }),
  );

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      <ViewTransitions>
        <QueryClientProvider client={queryClient}>
          <UrqlProvider value={urqlClient}>
            <ToastProvider>
              {children}
              <ToastViewport />
            </ToastProvider>
            {process.env.NODE_ENV === "development" && (
              <ReactQueryDevtools initialIsOpen={false} />
            )}
          </UrqlProvider>
        </QueryClientProvider>
      </ViewTransitions>
    </ThemeProvider>
  );
}
