# Cortex frontend — remaining tasks (2026-10-19)

Audit of the live build (https://cortex-red-three.vercel.app, commit 5807832): 13 app routes screenshotted at
1440 px in light and dark, plus a read of the shell, primitives and every screen's source. Items are evidence
from that audit or from earlier notes (handover, API gaps, the 2026-10-19 bug-fix session). Status is updated
at the end of this pass.

Legend: `[x]` done and verified · `[~]` partially done · `[ ]` open · `[-]` blocked (reason given)

## A. Known leftovers from earlier passes

- [ ] Knowledge-graph nodes render in the old lime palette; labels overlap in dense clusters.
- [ ] Chat: the citation `[1]` chip shows inline *and* again as a bare number in the row under the answer.
- [ ] Visual review of the screens not reviewed after the last redesign (agents, settings, auth, errors).

## B. Dead or fake controls (must work or go)

- [ ] Documents toolbar: "Search documents…" keeps local state but filters nothing.
- [ ] Documents toolbar: "Filter" and "Sort" are placeholder buttons ("coming soon").
- [ ] Documents table: "Chunks" column always shows "—" (the list API has no chunk count).
- [ ] Documents row action uses a left-right arrow icon with the tooltip "Open details (Part 3)".

## C. Broken layout

- [ ] Chat does not fill the viewport height; the panel ends mid-page with empty space below.
- [ ] Chat has no conversation list on mobile (history pane is `hidden md:flex`, no drawer).
- [ ] Documents status cell: badge stretches to the column width; the progress bar renders a sliver for
      indexed documents with a duplicate "INDEXED" label.
- [ ] Settings → Team: the actions column is clipped ("Reac…") and emails wrap mid-word.
- [ ] Settings → Usage: the period card wraps the date range over four lines at display size.
- [ ] Settings pages use three different header patterns (inside the card, outside the card, none).
- [ ] Settings duplicates the sidebar with a second 220 px vertical nav, squeezing content.

## D. Design system: orange-first identity (new direction)

- [ ] Tokens: warm neutral light theme, warm-charcoal dark theme, orange brand scale, sparing accents
      (lime, teal, blue, violet), semantic success/warning/error/info.
- [ ] Geometry: 8 / 14 / 20 / 24 px radii, pills for tags and primary controls, soft warm shadows.
- [ ] Typography: Manrope display (replaces Space Grotesk), Inter UI, JetBrains Mono for technical values.
- [ ] Brand mark: lightning bolt on an orange tile (logo, favicon, theme-color).
- [ ] Glass only on floating chrome (top bar, popovers, dialogs, composer), not on content cards.
- [ ] Theme: system preference as the default, Light / Dark / System switcher, no flash on load.

## E. Screens

- [ ] App shell: sidebar, top bar, page header pattern.
- [ ] Dashboard: bento layout with the primary task (asking Cortex) dominant; real data only.
- [ ] Documents, upload dialog, document drawer.
- [ ] Search.
- [ ] Chat (empty state, conversation, composer, citations panel).
- [ ] Agents and agent run.
- [ ] Knowledge graph.
- [ ] Settings: team, API keys, MCP, usage, audit log.
- [ ] Auth and onboarding: login, register, forgot/reset password, accept invite, workspace setup.
- [ ] Marketing: home, pricing.
- [ ] Error, 404, loading states.

## F. Verification

- [ ] Type-check, Biome, unit tests.
- [ ] Production build (Vercel / CI).
- [ ] Screenshots of every route at 375 / 768 / 1440 in light and dark, with an overflow and console check.

## Out of scope / blocked (backend)

- [-] G6 email delivery for invites and resets: needs an SES/SMTP provider (UI shows copyable links).
- [-] G7 `agent.model` is stored but not used for routing (UI labels the field honestly).
- [-] Document list has no name search, sort or chunk count on the API; the UI filters the loaded page
      client-side and says so when not every document is loaded.
