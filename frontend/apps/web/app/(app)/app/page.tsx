/**
 * `/app` — redirects to `/app/dashboard`.
 *
 * **F2 Part 2 (Task 20).** The old dashboard lived at
 * `/app`; the spec moves it to `/app/dashboard`. The
 * `/app` URL is now a redirect so any old link / bookmark
 * continues to work.
 */

import { redirect } from "next/navigation"

export default function AppIndex() {
  redirect("/app/dashboard")
}
