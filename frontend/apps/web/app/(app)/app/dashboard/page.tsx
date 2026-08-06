/**
 * Empty Dashboard — `/app/dashboard`.
 *
 * **F2 Part 2 (Task 20).** The first screen a new
 * workspace owner sees after onboarding. Renders the
 * EmptyState for "no documents yet" + a primary CTA
 * to upload the first document.
 *
 * **No feature work.** Per the spec, this is the *empty*
 * dashboard — no documents, no search, no chat, no graph,
 * no agents. Those land in F3+ once the data layer
 * catches up. The page is the "you have a workspace
 * and the app is ready" moment.
 *
 * **No tenant guard here.** The tenant check lives in
 * the (app) layout (which redirects to /workspace-setup
 * if the store has no tenant). This page assumes
 * `tenant` is populated and reads it for the welcome
 * line + the workspace avatar.
 *
 * **URL convention.** This file lives at
 * `app/(app)/app/dashboard/page.tsx` so the route group
 * `(app)` (auth + dark theme) wraps it AND the literal
 * `app/` segment keeps the URL consistent with the rest
 * of the authenticated app (`/app/agents`, `/app/settings`).
 *
 * **Server entry + client island.** The auth store is a
 * client-only Zustand singleton. To avoid the build-time
 * pre-render trying to call `useAuthStore` on the server,
 * we keep the page as a server component (so Next.js
 * doesn't try to render it at build time) and dynamically
 * import the client component with `ssr: false`. The
 * (app) layout's `ProtectedRoute` is the source of truth
 * for "is the user signed in?" — by the time the client
 * hydrates, the redirect to /login has already happened.
 */

import { DashboardView } from "./DashboardView"

export default function DashboardPage() {
  return <DashboardView />
}
