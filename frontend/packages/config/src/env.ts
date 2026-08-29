/**
 * Environment variable validation.
 *
 * V9 Frontend: every env var the app reads must be declared
 * here, validated with Zod, and exposed as a typed object.
 *
 * Server-only secrets (e.g. service tokens, internal API URLs)
 * are split from the `NEXT_PUBLIC_*` set so they cannot leak
 * into the client bundle.
 */

import { z } from "zod"

// Public env vars (NEXT_PUBLIC_*) — safe to ship to the browser.
const publicSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url().default("http://localhost:8000"),
  NEXT_PUBLIC_WS_URL: z.string().url().default("ws://localhost:8000"),
  NEXT_PUBLIC_GRAPHQL_URL: z.string().url().default("http://localhost:8000/graphql"),
  NEXT_PUBLIC_APP_NAME: z.string().default("Cortex"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  // F10-Part 4: analytics provider selection. The
  // default `noop` means "no provider configured";
  // the abstraction in `lib/analytics/provider/`
  // dispatches to the matching client. Production
  // values are `plausible` / `posthog` / `umami` /
  // etc. — see the F10-Part 4 catalog doc.
  NEXT_PUBLIC_ANALYTICS_PROVIDER: z.string().default("noop"),
  // F10-Part 4: the analytics provider's site ID /
  // API key / ingest token. Provider-specific; the
  // provider implementation knows how to use it.
  // Optional because the noop provider doesn't need
  // one.
  NEXT_PUBLIC_ANALYTICS_SITE_ID: z.string().optional(),
  // F10-Part 4: the analytics provider's ingest host
  // (e.g. `https://plausible.io` for the hosted
  // Plausible, or a self-hosted URL). Optional.
  NEXT_PUBLIC_ANALYTICS_HOST: z.string().url().optional(),
})

// Server-only env vars — never read on the client.
const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Server-only: e.g. a service token used by the (marketing)
  // route to pre-render docs pages that hit the private API.
  CORTEX_SERVICE_TOKEN: z.string().optional(),
})

const clientSchema = publicSchema
const serverFullSchema = serverSchema.merge(publicSchema)

/** Parsed public env (safe to call in the browser). */
export const publicEnv = clientSchema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
  NEXT_PUBLIC_GRAPHQL_URL: process.env.NEXT_PUBLIC_GRAPHQL_URL,
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_ANALYTICS_PROVIDER: process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER,
  NEXT_PUBLIC_ANALYTICS_SITE_ID: process.env.NEXT_PUBLIC_ANALYTICS_SITE_ID,
  NEXT_PUBLIC_ANALYTICS_HOST: process.env.NEXT_PUBLIC_ANALYTICS_HOST,
})

/**
 * Server env — only call inside a server context
 * (route handlers, server components, middleware).
 * Throws on the client.
 */
export function getServerEnv() {
  if (typeof window !== "undefined") {
    throw new Error("getServerEnv() must not be called in the browser")
  }
  return serverFullSchema.parse(process.env)
}

export type PublicEnv = z.infer<typeof publicSchema>
export type ServerEnv = z.infer<typeof serverFullSchema>
