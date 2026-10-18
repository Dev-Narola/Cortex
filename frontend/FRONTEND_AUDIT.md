# Cortex frontend — audit (2026-10-18)

Backend contract source of truth: live OpenAPI at `https://13-60-95-116.sslip.io/openapi.json`
(commit `745e7b7`).

## Architecture found

| Layer | What exists |
|---|---|
| Framework | Next.js 15 (App Router, typed routes), React 19, TypeScript 5.6, pnpm workspace |
| Styling | Tailwind v4 + OKLCH tokens in `packages/ui/src/styles/tokens.css` (single source), `motion.css` keyframes |
| Components | `@cortex/ui`: buttons, cards, forms, dialogs, overlays, navigation, feedback (toast, tooltip, skeleton, empty/error states), tables, typography, icons (lucide), motion helpers |
| State/data | TanStack Query (hooks in `hooks/*`), Zustand (auth store), services layer `services/*` over `lib/auth/api-client` (401 → refresh) |
| Realtime | Chat over WebSocket `/ws/conversations/{id}` (token frames, citations, message_complete); ingestion status socket with polling fallback |
| Theme | `next-themes`; the app shell **forces dark**, marketing **forces light** |
| Motion | CSS keyframes + GSAP (marketing); `prefers-reduced-motion` honoured in tokens |
| Tests | Vitest + Testing Library (unit), Playwright (e2e, needs a running stack), Biome lint, `tsc` |

## Routes

Marketing: `/`, `/pricing`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/workspace-setup`.
App: `/app` → `/app/dashboard`, `/chat`, `/chat/[id]`, `/app/documents`, `/app/graph`, `/app/agents`,
`/app/agents/[id]/runs/[runId]`, `/app/mcp`, `/app/settings/{api-keys,team,usage,audit-log,mcp}`.
Internal: `/component-showcase`.

## Findings

| # | Finding | Evidence | Fix |
|---|---|---|---|
| F1 | Visual identity is orange "ember" on near-black; brief asks for emerald/teal glass + bento, Inter / Space Grotesk / JetBrains Mono | `tokens.css`, `fonts.ts` (Bricolage + Space Grotesk) | Rewrite tokens + fonts once; every screen inherits |
| F2 | ~400 hard-coded palette classes in ~60 files (`text-paper-50`, `bg-ember-500/10` …), mostly light-on-dark text: a light theme would be unreadable | grep counts | Codemod to semantic tokens |
| F3 | App shell forces dark; no theme switch inside the app | `app/(app)/layout.tsx` `ThemeApplier` | Respect the user's choice; keep dark as default |
| F4 | Dashboard shows only quick-action buttons, no data, although usage, documents, conversations, audit APIs exist | `components/dashboard/*` | Bento dashboard from real endpoints |
| F5 | Search page missing (nav says "coming soon"); backend has `POST /api/v1/search` | `SidebarNav.tsx` | Build `/app/search` |
| F6 | Agents page is a heading only (nav "coming soon"); backend has agents CRUD + `POST /agents/{id}/execute`, runs, tool calls | `app/agents/page.tsx` | Agents list / create / run; link to existing run view |
| F7 | Team list expects `{items,total}`, backend returns a list → empty list | `services/team/types.ts` vs `GET /api/v1/users` | Adapt service |
| F8 | Invite expects `{member, invitation_token}`, backend returns `{email, role, invite_token, expires_in}`; no accept-invite page, no role change / deactivate UI | `services/team/*` vs OpenAPI | Adapt + `/accept-invite` + member actions (`PATCH /users/{id}`) |
| F9 | URL ingestion tab disabled ("backend has no /documents/url"); endpoint now exists | `UploadDocumentModal.tsx` | Wire `POST /api/v1/documents/url` |
| F10 | Failed documents use `reprocess` (indexed-only); backend `retry` endpoint unused | services/documents | Use retry for failed/stuck-pending |
| F11 | Chat answers are plain text: Markdown (`**bold**`, lists, code) shows raw; model cites as `【1】` | `MessageBubble.tsx`, prod answer | Safe Markdown render (no raw HTML) + both citation forms |
| F12 | Logout POSTs to non-existent `/auth/logout` (error swallowed) | `services/auth/logout.ts` | Drop the call (JWT is stateless) |
| F13 | Forgot/reset password call endpoints the backend doesn't have (no email system) | `services/auth/reset-password.ts` | Honest "not available" state; documented gap |
| F14 | Dead endpoint-registry entries (`/answer`, `/billing/usage`, `/admin/audit`, `/agents/{id}/invoke`, …) | `packages/config/src/api.ts` | Delete |
| F15 | Frontend CI red at Biome lint (pre-existing) | Actions run on `745e7b7` | Fix lint |

What already works and stays: auth + refresh, protected routes, documents table/upload/detail drawer with
real ingestion status, chat streaming over WS with citations, API keys, usage, audit log, graph explorer, MCP
settings, toasts, dialogs, skeletons, reduced-motion handling, "no fake data" discipline throughout.

## Found during implementation

| # | Finding | Fix |
|---|---|---|
| F16 | `ApiClient.get(path, query)` took query params as its 2nd argument, but every service passed `{ query, signal }`: all filtered GETs sent `?query=[object Object]&signal=[object AbortSignal]` (audit cursor/filters, conversation paging, graph `entity_id`, usage period, API-key paging silently ignored) | `get(path, { query, headers, signal })` like `post`/`patch`; test pins it |
| F17 | Every request used `credentials: "include"`; the API sends `Access-Control-Allow-Origin: *`, which browsers reject with credentials — login from any other origin failed. The backend sets no cookies | `credentials: "omit"` (bearer auth only) |
| F18 | REST conversations/messages arrive snake_case, app types are camelCase, nothing mapped: all conversation/message times showed "—", and resolving citations on a saved answer would throw (`retrievedChunkIds` undefined). Tests used camelCase fixtures, hiding it | `services/conversations/mappers.ts` at every read; fixtures now use the wire shape |
| F19 | Tailwind 4 beta emits `@theme` vars on `:root` after `tokens.css`; self-mapped keys (`--radius-xl: var(--radius-xl)`, fonts, shadows, easing) became cycles → square corners, serif fallback font | Those keys moved to `@theme reference`; next/font vars renamed (`--font-inter` …) |
| F20 | `formatRelative` sign inverted ("in 5 minutes" for past dates) | Fixed + test |
| F21 | Invented UI: notification bell with an unread dot, hard-coded "Free" plan + online dot, Profile/Workspace/Settings menu items pointing to a 404 | Bell removed; plan from `GET /tenants/me`; menu links only to real pages |
| F22 | Sidebar links were plain `<a>` (full page reload per click) | `next/link` via `SidebarItem asChild` |
| F23 | Nested `<li>` in chat history (hydration error) | Wrapper removed |
| F24 | Skip link targeted `#main`, which didn't exist | `id="main"` on both layouts' `<main>` |
| F25 | Mobile nav overlay had no focus trap / focus return | Radix `Drawer` |
| F26 | Backend: `GET /tenants/me/usage/summary` returns 500 on Postgres (`func.iif` is SQLite-only) | Fixed in `Cortex/src/billing/infrastructure/repositories.py` + test; **not deployed** |
| F27 | `GET /documents?status=` is ignored by the backend (no such parameter) | Dashboard counts statuses over the newest 200; see FRONTEND_API_GAPS.md |
| F28 | `Button size="icon"` dropped its children, so every icon-only button rendered empty (chat Send, theme toggle, citation panel close, rename, menus, rate-limit dismiss) | Children always render; regression test |

## Status (end of this pass)

F1–F25, F27, F28: done in code, covered by unit tests. F15: Biome is clean except two files that were already
uncommitted before this work (`app/error.tsx`, `app/(marketing)/error.tsx`). F26: fixed locally, needs a
deploy. Visual checks actually performed are listed in FRONTEND_HANDOVER.md.
