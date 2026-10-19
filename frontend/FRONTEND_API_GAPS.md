# Cortex frontend — backend API gaps (2026-10-18)

What the UI needed from the backend, and where each item stands. Nothing is faked in the UI; anything still
open is shown as an honest state.

## Resolved in this pass (backend + frontend)

| # | Gap | Resolution |
|---|---|---|
| G1 | Password reset: no endpoints, no email | Owner/admin issues a one-hour, single-use link: `POST /api/v1/users/{id}/password-reset` → `/reset-password?token=…` → `POST /api/v1/auth/reset-password`. The token embeds a fingerprint of the current password hash, so it dies once used. Team → "Reset password"; login has "Forgot password?" explaining how to get a link. Audit-logged. |
| G2 | Logout didn't revoke anything | `POST /api/v1/auth/logout` stores a SHA-256 of the refresh token in Redis until its expiry; `/auth/refresh` rejects it. The UI clears locally first, then revokes. Access tokens (short-lived) simply expire. If Redis is down, refresh fails open and logout returns 503 (UI still signs out locally). |
| G3 | Saved answers had no citation details | `MessageSchema.citations` (title, chunk index, 600-char excerpt) resolved in one tenant-scoped query, in `retrieved_chunk_ids` order; deleted sources are dropped. UI keeps `[n]` numbering and opens sources from the cached conversation. |
| G4 | `GET /documents?status=` ignored | `status` filter on list + total (`limit` now bounded 1–200, `count` is a real `COUNT(*)`). Dashboard shows exact counts. |
| G5 | Usage summary 500 on Postgres (`func.iif`) | Portable `case()`; test compiles the query for Postgres. |
| G8 | CORS was `*` in production | Default is now the Vercel origin + `http://localhost:3000` (`Cortex/docker/docker-compose.prod.yml`); other origins get 400. |

## Still open

| # | Gap | UI today | Suggested change |
|---|---|---|---|
| G6 | Email delivery (invites, resets) | Copyable links with the real expiry | SES/SMTP provider + sender; then send the same links by email |
| G7 | `agent.model` is stored but runs use the server's `NVIDIA_MODEL` | Field labelled "Model label" with that explanation | Route runs by `agent.model` (validated against served models) or drop the field |
| G9 | Notifications | No bell | — |
| G10 | Team roster is owner/admin-only | Members see a short note; Team/Audit log hidden for them | — (intended) |
