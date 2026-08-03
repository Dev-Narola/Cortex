/**
 * Edge middleware + route-guard foundation.
 *
 * **F0 scope (Tasks 30 + 47).** Per the spec:
 *   - **Task 30** — Placeholder. Stamps a request id, passes
 *     through. Does NOT enforce auth.
 *   - **Task 47** — `isAuthenticated()`, `hasToken()`,
 *     `redirectToLogin()` are exposed as pure helpers below.
 *     They're used in F2 by the real auth enforcement and in
 *     unit tests for the auth flow.
 *
 * **Architecture, not implementation.** The helpers live in
 * this file today so the import path is stable when F2 starts
 * wiring them into a real cookie check. Moving them later
 * would be a search-and-replace.
 *
 * **Edge runtime constraints.** No Node APIs (no `fs`, no
 * `crypto.createHash`). `crypto.randomUUID` and the Web Crypto
 * subset available on the Edge runtime are fine.
 */

import { type NextRequest, NextResponse } from "next/server"

/** Where the auth pipeline sends unauthenticated users. */
export const ROUTES = {
  login: "/login",
  register: "/register",
  app: "/app",
} as const

/** Cookie names — locked in here so server + client agree. */
export const COOKIES = {
  access: "cortex_access",
  refresh: "cortex_refresh",
} as const

/** Path prefixes owned by each route group. */
const APP_PREFIX = "/app"
const AUTH_PREFIXES = ["/login", "/register", "/accept-invite"] as const

// ---------------------------------------------------------------------------
// Route-guard helpers (Task 47).
//
// These are the *only* place auth checks are written. When F2 lands the
// real auth contract, the bodies of these functions change; the call-sites
// (also inside this file) do not.
// ---------------------------------------------------------------------------

/**
 * Read the access-token cookie. Returns `null` if absent.
 * In F2 this will also verify the JWT signature + expiry.
 */
export function hasToken(request: NextRequest): boolean {
  return request.cookies.get(COOKIES.access)?.value != null
}

/**
 * True when the request carries a valid session. F0: cookie
 * presence. F2: cookie presence + signature + expiry + tenant match.
 */
export function isAuthenticated(request: NextRequest): boolean {
  // F0 placeholder: any access cookie is considered authenticated.
  return hasToken(request)
}

/**
 * Build a redirect to `/login`, preserving the original destination
 * as `?next=...` so the post-login flow can resume where the user
 * tried to go.
 */
export function redirectToLogin(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone()
  url.pathname = ROUTES.login
  url.search = ""
  url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search)
  return NextResponse.redirect(url)
}

// ---------------------------------------------------------------------------
// Middleware entry point.
// ---------------------------------------------------------------------------

export function middleware(request: NextRequest) {
  // Stamp a request id so the auth layer (F2) can read it back.
  const requestHeaders = new Headers(request.headers)
  if (!requestHeaders.has("x-request-id")) {
    requestHeaders.set("x-request-id", crypto.randomUUID())
  }

  // F2 will wire the real auth check using these helpers. The
  // constants are kept here so the path prefixes have a single
  // source of truth — see the block comment above for the F2
  // check that will replace the `void` below.
  void APP_PREFIX
  void AUTH_PREFIXES

  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.svg|openapi.json|.*\\..*).*)"],
}
