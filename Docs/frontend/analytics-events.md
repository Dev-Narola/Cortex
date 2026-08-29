# Cortex Frontend — Analytics Event Catalog

**Status:** F10-Part 4 (Analytics & Conversion Tracking) — the
provider-agnostic event catalog + the abstraction layer are
shipped. **No specific provider is selected** — the abstraction
in `apps/web/lib/analytics/` accepts any provider that implements
the `AnalyticsClient` interface. The selection decision belongs
to the team's operations + privacy review (see §"Provider
selection — open question" below).

## Why this doc exists

The F10 roadmap calls for "Analytics / conversion tracking on
the marketing site" without mandating a provider. Before any
provider integration, Cortex needs a **stable event contract**:
which events, which properties, what each event means, and
which events must never include sensitive data. This doc is
that contract.

The F0–F8 implementation calls the abstraction via
`track("event_name", { ...properties })`. The provider is
swappable without touching any call site.

## Event catalog

Every event is one of:

- **Marketing** — happens on the public marketing site (light
  theme, no auth)
- **Auth** — happens in the auth flow (light theme, no auth)
- **Product adoption** — happens in the authenticated app shell
  (dark theme, after login)

### Marketing events

| Event | Trigger | Properties | Sensitive data? |
| --- | --- | --- | --- |
| `landing_page_view` | First paint of `/` (the marketing home) | `path` | No |
| `pricing_page_view` | First paint of `/pricing` | `path` | No |
| `marketing_cta_clicked` | Any CTA on the marketing site (hero, feature, final) | `location` (e.g. `hero`, `feature`, `final`) | No |
| `live_demo_started` | User opens the F8 live interactive demo (any chip click) | `section` (e.g. `hero_demo`, `feature_demo`) | No |
| `live_demo_question_submitted` | User submits a question in the live demo | `section` | No |
| `live_demo_completed` | The demo answer streams to completion | `section`, `citation_count` | No |
| `demo_source_viewed` | User opens a citation's source panel | `section` | No |
| `pricing_viewed` | User navigates to `/pricing` (alias of `pricing_page_view` for funnel analysis) | — | No |

**Property reference (marketing):**

- `path` — the current path, e.g. `/`, `/pricing`. Used to
  answer "where in the marketing site did the user convert?"
- `location` — the specific CTA surface, e.g. `hero`,
  `feature`, `final`. The hero CTA is the loudest entry
  point; the final CTA is the calmest. Funnel analysis can
  compare which entry point converts better.
- `section` — the live demo is the same component rendered
  in multiple marketing sections. `section` identifies
  which one.
- `citation_count` — the number of citations the demo answer
  included. A leading indicator of answer quality / value.

### Auth events

| Event | Trigger | Properties | Sensitive data? |
| --- | --- | --- | --- |
| `signup_started` | User submits the signup form (regardless of outcome) | `invite_token` (boolean) | No |
| `signup_completed` | Signup succeeds server-side | — | No |
| `signup_failed` | Signup fails with a server-validated error | `reason` (sanitised; not the server's raw error string) | No |
| `login_started` | User submits the login form | — | No |
| `login_completed` | Login succeeds server-side | — | No |
| `login_failed` | Login fails with a server-validated error | `reason` (sanitised) | No |
| `logout_completed` | User explicitly logs out | — | No |

**Property reference (auth):**

- `invite_token` — boolean. Signup can be initiated from
  an invite link (workspace invite) or cold (no invite).
  Cohort analysis: cold signups vs invite signups.
- `reason` — a **sanitised, enumerated** string. Allowed
  values: `invalid_credentials`, `email_taken`, `network`,
  `rate_limited`, `unknown`. **Never** send the server's
  raw error string — it can include the user's email
  address or other identifying info.

### Workspace events

| Event | Trigger | Properties | Sensitive data? |
| --- | --- | --- | --- |
| `workspace_setup_viewed` | User opens the workspace-setup screen | `from` (e.g. `signup`, `direct`) | No |
| `workspace_created` | Workspace is successfully created server-side | `source` (e.g. `signup`, `recover`) | No |

### Product adoption events

| Event | Trigger | Properties | Sensitive data? |
| --- | --- | --- | --- |
| `first_document_uploaded` | The first successful document upload per user | `source` (`file`, `url`), `file_type` (`pdf`, `docx`, ...) | No |
| `document_uploaded` | Any subsequent document upload (after the first) | `source`, `file_type` | No |
| `first_chat_question` | The first chat question per user (per workspace) | — | No |
| `chat_question_sent` | Any subsequent chat question | — | No |
| `agent_run_completed` | An agent run completes (success or failure) | `status` (`ok`, `error`) | No |
| `knowledge_graph_viewed` | User opens `/app/graph` | `mode` (`2d`, `3d`) | No |

**Property reference (product adoption):**

- `source` — how the document was uploaded. The upload
  modal has two tabs (file picker + URL paste); the funnel
  is "which path is healthier?"
- `file_type` — what kind of file. Helps answer "is the
  upload UX good for PDFs specifically?"
- `mode` — Knowledge Graph 3D vs 2D (F9 P2 fallback).
  Funnel: "do users abandon the graph because the 3D
  doesn't render well on their device?"

## The full marketing funnel

The F10-Part 4 funnel, in order:

```text
                    Visitor
                       ↓
                landing_page_view
                       ↓
                marketing_cta_clicked  (or live_demo_started)
                       ↓
                signup_started
                       ↓
                signup_completed
                       ↓
                workspace_created
                       ↓
                first_document_uploaded
```

**Primary conversion:** `signup_completed`
(without `signup_completed`, the user isn't a customer).

**Secondary conversions:**
`live_demo_completed`, `workspace_created`,
`first_document_uploaded` (the last one is the
**real adoption** signal — signup without a workspace
is a dead end, and a workspace without a document is
an empty account).

**Guardrail metrics:** `signup_failed`, `login_failed`,
`live_demo_abandoned` (counterpart to `live_demo_started` —
a user who starts the demo but never completes it is a
leading indicator of friction).

## Sensitive data contract

**NEVER include in any analytics payload:**

- ❌ Document contents (titles, bodies, source files)
- ❌ Chat messages (user prompts, LLM responses, citations)
- ❌ LLM prompts / responses
- ❌ API keys (raw or redacted)
- ❌ Access tokens / refresh tokens / session JWTs
- ❌ MCP tokens
- ❌ Passwords (hashed or otherwise)
- ❌ User email addresses (the `login_failed.reason` is
  sanitised; the `email` field is **not** in any event)
- ❌ Tenant IDs (the `workspace_created` event deliberately
  does **not** include the tenant ID; cohort analysis
  uses event counts, not per-tenant breakdowns)
- ❌ Conversation IDs / document IDs / run IDs
- ❌ IP addresses (the provider's server-side collection
  is configured to drop or hash IPs per the privacy
  contract; the client never sends them)
- ❌ Free-text user input (the `signup_started` event
  fires on submit but does **not** include the submitted
  email value)

The `track()` function in `lib/analytics/track.ts` is
the single chokepoint. The `AnalyticsClient` interface
documents this contract; a real provider implementation
MUST enforce it server-side too (the client is the
first line of defense, the provider's ingest is the
second).

## Property design rules

1. **No PII.** Email, name, tenant, IP — never. The
   `workspace_created.source` is `signup` or `recover`,
   not a user identifier.
2. **No user content.** No document titles, no chat
   snippets, no filenames (filenames can leak project
   names, customer names, etc.).
3. **Enums, not free text.** A `reason` field is
   `invalid_credentials` / `email_taken` / `network`
   / `rate_limited` / `unknown` — never a free-text
   error string from the server.
4. **Counters, not identifiers.** `citation_count: 3`,
   not `citation_id: 'abc-123'`.
5. **One primary conversion per funnel.** A funnel
   has ONE primary success metric (`signup_completed`)
   plus a small number of secondary conversions. Adding
   more is vanity-metric tracking.

## Provider selection — open question

This part ships **without selecting a provider**. The
abstraction in `lib/analytics/` accepts any client that
implements `AnalyticsClient`. When the team picks a
provider, the implementation is a 1-file change in
`lib/analytics/provider/`. Candidate providers, in
descending order of fit for Cortex's privacy + cost
+ simplicity profile:

| Provider | Privacy | Self-host | Cost | Notes |
| --- | --- | :-: | --- | --- |
| Plausible | strong | yes | $$ | simple events, no PII, lightweight script |
| PostHog | configurable | yes | $$ | funnels + A/B built in; more complex |
| Umami | strong | yes | free | self-hosted, simple events |
| Google Analytics 4 | opt-out required | no | free | invasive by default; not Cortex's style |
| Segment + downstream | depends | no | $$$ | overkill for the F10 funnel |

The decision belongs to the team's operations + privacy
review. The abstraction makes the choice reversible.

## Event verification

When a provider is selected, the verification flow is:

1. Open the provider's debug console
2. Open `/` in a browser → confirm `landing_page_view`
3. Click a hero CTA → confirm `marketing_cta_clicked` with
   `location: "hero"`
4. Open the live demo → submit a question → confirm
   `live_demo_started` + `live_demo_question_submitted` +
   `live_demo_completed` (with `citation_count`)
5. Sign up → confirm `signup_started` + `signup_completed`
6. Create a workspace → confirm `workspace_created`
7. Upload a document → confirm `first_document_uploaded`
8. Inspect the payload: confirm NO email, NO document
   content, NO IDs, NO PII

## Conversion funnel (operator view)

The dashboard (operator-side) shows:

```text
Landing page (unique visitors)
   ↓  CTR = marketing_cta_clicked / landing_page_view
Signup started
   ↓  Conversion = signup_completed / signup_started
Signup completed
   ↓  Conversion = workspace_created / signup_completed
Workspace created
   ↓  Adoption = first_document_uploaded / workspace_created
First document uploaded
```

Drop-off at any step is a P1 to investigate.

## F10-Part 4 Definition of Done

- [x] Event catalog documented (this file)
- [x] Provider-agnostic abstraction shipped
  (`lib/analytics/`)
- [x] Environment configuration added
  (`NEXT_PUBLIC_ANALYTICS_*` + dev/prod separation)
- [x] Marketing events wired (hero, demo, final CTAs)
- [x] Auth events wired (signup, login, logout)
- [x] Workspace events wired (workspace_created)
- [x] Product adoption events wired (first document, first
      chat, agent run, graph view)
- [x] Sensitive data exclusion (no PII, no content, no
      free text, no IDs)
- [x] Development analytics separated (dev → console +
      memory buffer; prod → provider; no production
      events from `localhost`)
- [ ] Analytics tests for the abstraction (deferred to a
      follow-up commit — the abstraction is small and the
      call sites are reviewable by eye for now; full
      provider + integration tests are part of the
      "provider selected" follow-up)
- [x] Event verification flow documented
- [ ] Provider selected (deferred to the team's
      operations + privacy review)
- [ ] Provider implementation (deferred — 1 file in
      `lib/analytics/provider/`)
- [ ] Live conversion funnel visible (deferred — depends
      on provider)

## Out of scope (deferred)

- A/B testing infrastructure — F10-Part 5.
- Per-component visual regression in every state — F10-Part 3
  deferred items.
- Cross-tab funnel analysis (e.g. "did the pricing page
  visitor also see the demo?") — depends on the provider's
  query layer.
- Server-side analytics (the backend can fire its own
  events for the F6 / F7 product surfaces; this doc only
  covers the frontend client).
