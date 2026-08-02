/**
 * Edge middleware — runs before every request.
 *
 * Responsibilities:
 *   1. Redirect unauthenticated users away from `/app/*` to `/login`.
 *   2. Redirect already-authenticated users away from `/login`,
 *      `/register`, `/accept-invite/*` to `/app`.
 *   3. Refresh the access token silently when the cookie
 *      refresh-token is still valid (mirrors the auth/refresh
 *      silent-retry pattern documented in Docs/frontend/real-time.md).
 *
 * V9 Frontend: this is the only file that runs in the Edge
 * runtime — keep it lean, do not import the API client here.
 */

import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = new Set(["/", "/pricing", "/docs", "/login", "/register"]);
const APP_PREFIX = "/app";
const AUTH_PREFIXES = ["/login", "/register", "/accept-invite"];

const ACCESS_COOKIE = "cortex_access";
const REFRESH_COOKIE = "cortex_refresh";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;

  const isAppRoute = pathname.startsWith(APP_PREFIX);
  const isAuthRoute = AUTH_PREFIXES.some((p) => pathname.startsWith(p));

  // (1) Unauthenticated → /login (preserving the destination).
  if (isAppRoute && !access) {
    if (refresh) {
      // Token expired but refresh is valid — let the page load
      // and the in-page auth store will silently refresh.
      return NextResponse.next();
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // (2) Authenticated user lands on /login|/register — bounce to /app.
  if (isAuthRoute && access) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Run on every page route EXCEPT static assets, API routes, and
    // the codegen output (which is app-internal anyway).
    "/((?!_next/static|_next/image|favicon.ico|openapi.json|.*\\..*).*)",
  ],
};
