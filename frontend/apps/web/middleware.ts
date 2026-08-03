/**
 * Edge middleware — runs before every request.
 *
 * **F0 scope (Task 30).** Placeholder. Does NOT enforce auth.
 * Auth gating is owned by F2 and will be layered in here (or in
 * the route-group layouts) once the auth contract is finalised.
 *
 * Today this file exists for two reasons:
 *   1. To prove the Edge-runtime entry point works end-to-end
 *      (matches the `matcher` config below).
 *   2. To set a single header that downstream route handlers
 *      and the (eventual) auth check can use as a request id
 *      without re-deriving one.
 *
 * **Future work** (F2):
 *   - Read the access token from a cookie.
 *   - On `/app/*` without a valid token → redirect to `/login`.
 *   - On `/login|/register` with a valid token → redirect to `/app`.
 *   - Optionally: silent refresh via the `/auth/refresh` endpoint.
 *
 * Edge runtime constraints: do NOT import the API client or any
 * Node-only modules here. Stay lean — this runs on every request.
 */

import { type NextRequest, NextResponse } from "next/server"

export function middleware(request: NextRequest) {
  // Stamp a request id so the upcoming auth layer (F2) can read it
  // back off the request and log it without generating its own.
  const requestHeaders = new Headers(request.headers)
  if (!requestHeaders.has("x-request-id")) {
    requestHeaders.set("x-request-id", crypto.randomUUID())
  }
  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: [
    // Run on every page route EXCEPT static assets, API routes,
    // and the codegen output (which is app-internal anyway).
    "/((?!_next/static|_next/image|favicon.svg|openapi.json|.*\\..*).*)",
  ],
}
