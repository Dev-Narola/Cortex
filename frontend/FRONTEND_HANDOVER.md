# Cortex frontend — handover (2026-10-18)

Companion docs: `FRONTEND_AUDIT.md` (findings F1–F28 + status), `FRONTEND_IMPLEMENTATION_PLAN.md`,
`FRONTEND_DESIGN_SYSTEM.md` (tokens, components, motion, a11y rules), `FRONTEND_API_GAPS.md`.

## What changed

**Identity and theming.** New palette and glass surfaces in `packages/ui/src/styles/tokens.css` (dark
primary, full light theme), Inter / Space Grotesk / JetBrains Mono, radii 8/16/20/24/pill. The app no longer
forces dark and marketing no longer forces light; one theme toggle in the topbar, persisted. ~216
hard-coded dark-only classes moved to semantic tokens. Fixed a Tailwind-beta cycle that had been rendering
every radius square and every font as the serif fallback (F19).

**Shell.** Sidebar grouped Workspace / Management / System with only working routes; Team and Audit log hidden
for roles the backend refuses. Client-side navigation, logo + workspace chip with the real plan. Topbar:
breadcrumbs from the nav, ⌘K search, theme toggle, user menu (fake notification bell removed). Mobile drawer
is a Radix dialog. The shell is viewport-height with only `<main>` scrolling; page entry animates per section.

**Screens.**
- Dashboard: bento grid from real endpoints (documents, processing/failed, conversations, month-to-date
  requests/tokens/estimated cost, API health with measured latency, recent documents, recent conversations,
  recent audit activity for admins). Empty workspace leads with the upload call-to-action.
- Search (`/app/search`, new): hybrid search, query in the URL, highlighted passages, opens the document.
- Agents (`/app/agents`, was a heading): list, create, run (result + stats + link to the run inspector), delete.
- Team: real roster shape, role change and deactivate/reactivate with the backend's rules, invite creates a
  shareable link (the backend sends no email); new `/accept-invite` page.
- Documents: URL import (`POST /documents/url`), Retry for failed documents (`/retry`, not `/reprocess`).
- Chat: answers render as Markdown (no raw HTML); `[n]`, `【n】`, `[Source n]` become source chips only when
  that citation exists.
- Password reset: Team → "Reset password" gives a one-hour link; `/reset-password?token=` sets the password;
  login has "Forgot password?" (`/forgot-password` redirects there).
- `/app/mcp`, `/app/conversations` stubs now redirect to the real pages.

**Integration bugs fixed** (each has a test): `ApiClient.get` sent every filter as `?query=[object Object]`
(F16); `credentials: "include"` made browsers reject the API's `*` CORS header, so login from another origin
failed (F17); conversations/messages were never mapped from snake_case, so all times showed "—" and citations
on saved answers would throw (F18); icon-only buttons rendered empty, including chat Send (F28); logout called
a non-existent endpoint; relative times said "in 5 minutes" for the past.

**Backend (second pass, deployed with this push).** Usage summary fixed for Postgres (`case()` instead of
SQLite-only `iif()`); `GET /documents?status=` filter with exact totals; saved messages carry resolved
`citations`; `POST /auth/logout` revokes refresh tokens (Redis denylist); owner/admin-issued password reset
links (`POST /users/{id}/password-reset`, `POST /auth/reset-password`). Backend suite: 961 passed, coverage
78.5%; architecture check OK; mypy 103 (ceiling 116). The UI uses all of these (exact dashboard counts,
sources on saved answers, revoking sign-out, Team → "Reset password", `/reset-password`).

**Lint.** Frontend CI was already red on Biome at `745e7b7` (175 unformatted files untouched by this work plus
real rule hits). Applied Biome's safe fixes, fixed the remaining rules by hand, and allowed non-null
assertions in test files only. Biome and TypeScript are now fully clean.

## Verification actually performed

| Check | Result |
|---|---|
| `pnpm -r typecheck` | all packages pass |
| Biome (`biome check .`) | clean |
| Web unit tests (`vitest run --maxWorkers=2`) | 134 files, 1046 tests passing |
| UI package tests | 17 files, 136 tests passing |
| Backend | full suite 961 passed (coverage 78.5%), ruff gate, architecture check, mypy 103/116 |
| Browser, `next dev` against the production API | login 1440 dark + light; dashboard 1440 + 375 dark; search 1440 + 375 dark; chat end to end at 1440 dark (asked a real question, streamed Markdown answer with a citation chip, reload kept it with correct timestamps) |

**Not verified visually** (the dev server ran out of memory on this machine and was stopped): documents,
knowledge graph, agents, team, API keys, MCP, usage, audit log, accept-invite, the app in light theme, and the
768 / 1280 widths. The screenshots above also predate the last fixes (processing count, icon buttons,
`[Source n]` chips). The production `next build` was not run locally; the Frontend CI workflow runs it.
A round palm-tree badge appeared bottom-right only under `next dev`; it is not in the app source, so most
likely a dev-time overlay. Worth a glance on the first deployed build.

## Your previously uncommitted files

Committed with this push: `app/error.tsx` and `app/(marketing)/error.tsx` (your redirect fix kept; the unused
`useEffect` import removed so typecheck/lint pass), `components/marketing/marketing-header.tsx` (your
`"use client"`), and `.env.example` (your URL updates; `NEXT_PUBLIC_APP_URL` changed to `http://` since
`next dev` serves http). Your edit to the forced-light script in `(marketing)/layout.tsx` is superseded:
that script is removed because themes are no longer forced.

## Next steps

See the final report in the session; in short: host the frontend, set `CORS_ALLOWED_ORIGINS`, check the
screens listed under "Not verified", and decide on email delivery (G6).
