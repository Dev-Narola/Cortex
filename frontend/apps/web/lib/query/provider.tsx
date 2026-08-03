/**
 * QueryProvider — mounts the `QueryClient` and the devtools.
 *
 * **F0 scope (Task 18).** This is the only place in the app that
 * instantiates a `QueryClient`. Consumed by `components/providers.tsx`,
 * which composes it with the rest of the root providers.
 *
 * The `useState` initialiser is the standard TanStack pattern for
 * Next.js App Router: each render of the server gets a fresh client,
 * but the same client is reused across client re-renders.
 *
 * The devtools panel is mounted in development only; it ships zero
 * bytes to production.
 */

"use client"

import { QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { type ReactNode, useState } from "react"

import { createQueryClient } from "./client"

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => createQueryClient())
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === "development" && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  )
}
