/**
 * Root page — redirects to the dashboard if signed in, the
 * landing page otherwise. Auth state is resolved in middleware
 * (see lib/auth/middleware.ts), so the server can choose
 * the redirect target without a client round-trip.
 */
import { redirect } from "next/navigation";

export default function RootPage() {
  // The auth gate lives in middleware; if we get here, the
  // user is either signed in (in which case middleware would
  // have sent them to /app) or signed out (in which case we
  // send them to the marketing landing).
  redirect("/app");
}
