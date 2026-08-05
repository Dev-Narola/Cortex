/**
 * Edge middleware + route-guard.
 *
 * **F2 Part 1 (Task 10).** The first line of defence
 * for the auth gate. Redirects unauthenticated
 * requests to the `/app/*` routes to `/login?next=...`
 * at the edge, before any HTML is sent.
 *
 * **Cookie-based check.** The api-client stores the
 * access token in sessionStorage (client-side), so
 * the edge can't read it directly. The middleware
 * uses a *cookie* hint that the client sets whenever
 * the auth store is hydrated. The cookie is a
 * *presence* hint, not a *validity* check — the
 * client-side `ProtectedRoute` is the real check.
 *
 * **Why a presence hint + a client-side check.** Two
 * reasons:
 *   1. **Edge performance.** A redirect at the edge
 *      skips rendering the protected layout at all.
 *   2. **No JWT verification on the edge.** Edge
 *      runtimes don't have the JWT library we use, and
 *      a fake cookie would still let users through the
 *      edge gate. The client-side `ProtectedRoute` is
 *      the source of truth.
 *
 * **Path prefixes.**
 *   - `APP_PREFIX` = `/app` — the authenticated app.
 *     Redirects to `/login?next=...` when the cookie
 *     hint is absent.
 *   - `AUTH_PREFIXES` = `/login`, `/register`,
 *     `/forgot-password`, `/reset-password` — already
 *     authenticated users are pushed to `/app` so
 *     they don't see the login screen.
 *   - Everything else (`/`, `/pricing`, `/openapi.json`,
 *     `/api/*`, static assets) passes through.
 */

import { type NextRequest, NextResponse } from "next/server"

/** Where the auth pipeline sends unauthenticated users. */
export const ROUTES = {
  login: "/login",
  register: "/register",
  forgot: "/forgot-password",
  reset: "/reset-password",
  app: "/app",
} as const

/** Cookie hint set by the client. Presence = "the auth store hydrated with a session". */
export const COOKIES = {
  /** Set when a session is restored from sessionStorage. Cleared on logout. */
  authHint: "cortex_auth_hint",
} as const

const APP_PREFIX = "/app"
const AUTH_PREFIXES = [ROUTES.login, ROUTES.register, ROUTES.forgot, ROUTES.reset] as const

/**
 * Read the auth-hint cookie. Returns `true` if the
 * client believes it has a session, `false` otherwise.
 * The cookie is set by the client (`useAuthStore`) — the
 * edge doesn't sign or verify it.
 */
export function hasAuthHint(request: NextRequest): boolean {
  return request.cookies.get(COOKIES.authHint)?.value === "1"
}

/**
 * Build a redirect to `/login`, preserving the original
 * destination as `?next=...` so the post-login flow can
 * resume where the user tried to go.
 */
export function redirectToLogin(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone()
  url.pathname = ROUTES.login
  url.search = ""
  url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search)
  return NextResponse.redirect(url)
}

/**
 * Build a redirect to `/app` — for users who are already
 * signed in and land on a public auth page.
 */
export function redirectToApp(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone()
  url.pathname = ROUTES.app
  url.search = ""
  return NextResponse.redirect(url)
}

export function middleware(request: NextRequest) {
  // Stamp a request id so server logs can be correlated.
  const requestHeaders = new Headers(request.headers)
  if (!requestHeaders.has("x-request-id")) {
    requestHeaders.set("x-request-id", crypto.randomUUID())
  }

  const { pathname } = request.nextUrl

  // 1. Authenticated app — must have a session hint.
  if (pathname.startsWith(APP_PREFIX)) {
    if (!hasAuthHint(request)) {
      return redirectToLogin(request)
    }
  }

  // 2. Public auth pages — bounce already-signed-in users.
  if (AUTH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    if (hasAuthHint(request)) {
      return redirectToApp(request)
    }
  }

  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.svg|openapi.json|.*\\..*).*)"],
}
