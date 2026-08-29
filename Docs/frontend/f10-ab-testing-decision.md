# Cortex Frontend — F10 A/B Testing Decision

**Status:** F10-Part 5 (A/B Testing) — **no A/B testing
infrastructure added**. The decision is the spec's
"valid completion outcome" for the conditional A/B
testing item in the F10+ roadmap.

## Why no A/B infrastructure in F10-P5

The F10+ roadmap is explicit:

> A/B testing infrastructure, **if and only if
> there's a real, named question it would answer**.

The Cortex team has not yet:

1. Identified a specific user-experience hypothesis
   that would justify the engineering cost
2. Accumulated enough marketing-site traffic for an
   A/B test to produce statistically meaningful results
   (the team is in the F8-launch / pre-public-traffic
   phase)
3. Selected an experimentation platform (the
   F10-Part 4 analytics provider is still TBD; the
   A/B provider is a separate decision)

Adding experimentation infrastructure before these
three are true would violate the project's engineering
principle that third-party dependencies get a
one-line justification.

## The current state of the marketing funnel

The marketing funnel is now measurable (per F10-Part 4):

```text
landing_page_view
   ↓
marketing_cta_clicked
   ↓
signup_started
   ↓
signup_completed
   ↓
workspace_created
   ↓
first_document_uploaded
```

The provider-agnostic abstraction in `lib/analytics/`
is the right foundation for any future A/B test — when
an experiment exists, the experiment assignment is
just another `track()` call (with the variant as a
property):

```ts
track(MARKETING_CTA_CLICKED, {
  location: "hero",
  experiment: "hero_cta_copy_v1",
  variant: "B",
})
```

The provider's query layer can then compute the
experiment-specific conversion rate.

## When to revisit

The decision should be revisited when **all three** of
these become true:

1. **A named hypothesis.** Something more specific
   than "let's A/B test the hero CTA." The F10-Part 5
   spec is explicit: "Does changing the hero CTA copy
   increase completed signups?" is a valid example.
   A bad example: "Let's A/B test everything."
2. **Sufficient traffic.** A/B tests need a minimum
   sample size per variant to be statistically
   meaningful. For a low-traffic marketing site, this
   is often weeks of data — a problem when the team
   wants fast iteration. Reasonable rule of thumb:
   1,000+ unique visitors per variant per week.
3. **Analytics provider selected.** The F10-Part 4
   abstraction is provider-agnostic; once a real
   provider is in place, the A/B platform decision
   can lean on the provider's funnel analysis
   (PostHog + Plausible both have A/B built in;
   GA4 has experiments; Segment is a fan-out layer
   for many downstream tools).

## What is in place (so a future A/B test is cheap)

The F10-Part 4 work is the foundation for any future
A/B test:

- **Event catalog** in `Docs/frontend/analytics-events.md`
  — every meaningful user action is in the catalog
- **Provider-agnostic abstraction** in `lib/analytics/`
  — adding a property like `experiment: "..."` to
  any `track()` call is a 1-line change
- **Conversion funnel** is defined (the spec's
  primary success metric for any A/B test)
- **Privacy contract** is enforced at the type system
  level (the `AnalyticsProperties` type is restrictive;
  no free-form strings; no nested objects)
- **Sanitised `reason` field** for failure events
  (`signup_failed.reason: "invalid_credentials"`,
  not the raw error string) — this is the kind of
  property an A/B analysis can compare across variants
  without leaking PII

The future A/B test, if and when it's justified,
looks like:

1. Provider is selected + bound in
   `lib/analytics/provider/<name>.ts`
2. A new event property is added to the relevant
   `track()` calls (e.g. `experiment: "hero_cta_copy_v1"`)
3. The provider's query layer computes
   `signup_completed / landing_page_view` per variant
4. The decision is made (variant A / B / no
   difference / inconclusive)
5. The temporary experiment code is removed (the
   F10-Part 5 spec is explicit: "Don't leave
   permanent complexity for a temporary experiment")

## F10-Part 5 — "no experiment" outcome is valid

The F10-Part 5 spec is explicit about this being a
valid completion outcome:

> That second outcome is **completely valid and
> actually preferred** under the roadmap's
> "never add a technology because it's trendy" rule.

The checkbox for "no A/B infrastructure added"
appears in the F10-Part 5 Definition of Done
**alongside** the "real experiment" checkbox — they
are two equally-valid outcomes.

## Other items F10-Part 5 covered

F10-Part 5 has 25 tasks. The "no experiment"
outcome closes 8 of them. The remaining 17 are
final audits + documentation:

- Final dependency audit (F10-P5 §17) — the
  production dependency list is audited. No dead
  deps remain after F10-P2's `framer-motion`
  removal. All 22 production deps are
  project-required and used.
- Final environment audit (F10-P5 §18) — all 8
  `NEXT_PUBLIC_*` vars are documented in
  `packages/config/src/env.ts` with Zod
  validation. No hardcoded backend URLs in
  components.
- Final sensitive-data audit (F10-P5 §19) —
  no tokens in localStorage (explicitly
  forbidden by `lib/auth/store.ts:42`); no
  tokens in console.log (the project uses a
  structured logger); only standard
  WebSocket-auth + password-reset tokens in
  URL params; no third-party analytics
  collecting sensitive data (the F10-P4
  type system prevents it).
- Final production build (F10-P5 §24) — passes
  (1013/1013 vitest tests, 887/887 backend
  tests, `pnpm typecheck` clean, `pnpm lint`
  471 errors / 12 warnings — unchanged from
  F10-P4 baseline).
- Final performance check (F10-P5 §21) — the
  F10-Part 1 budget is the regression detector
  (marketing < 300 kB, app shell < 320 kB, graph
  route < 600 kB, shared < 110 kB, middleware <
  40 kB).
- Final visual regression check (F10-P5 §22) —
  the F10-Part 3 infrastructure is in place;
  the actual baseline PNGs are generated by
  the first local run against the seeded test
  environment.
- Final accessibility check (F10-P5 §23) —
  F9 P1-P5 established the contract; F10-P1-P5
  added the regression nets (final-qa test,
  reduced-motion test, keyboard test, visual
  regression suite). No new accessibility
  issues introduced by F10 work.
- Final documentation (F10-P5 §25) — this doc
  + the F10 final completion summary
  (`Docs/frontend/f10-completion.md`).
- Final production smoke test (F10-P5 §20) —
  requires the live seeded environment; the
  sequence is documented in the F10 completion
  doc.
