# Runbook — High Error Rate

V9 Part 3, Task 37.

## Detection

* `cortex_http_5xx_total` rate > 1% of total requests for
  > 5 min
* The error budget for the day is exhausted
* The dashboard shows a spike in 5xx responses

## Immediate response

1. Check the most common 5xx path in the access logs.
2. If the error is concentrated on a single endpoint,
   check that endpoint's downstream dependencies.
3. If the error is spread across the platform, check
   the shared infrastructure (DB, Redis, queue).
4. If a recent deploy is suspected, roll back to the
   previous release.

## Escalation

* If the error rate is > 5% for > 5 min, escalate to
  the engineering lead.
* If the error is caused by a third-party provider
  (LLM, S3), open a ticket with the provider.

## Recovery

1. Roll back the deploy if applicable.
2. Disable the failing feature flag if applicable.
3. Scale the affected component.
4. Restore the dependency if it was the cause.

## Validation

* Error rate returns to < 0.1%.
* The smoke test suite passes.
* The dashboard shows a clean state.

## Post-incident review

* Record the timeline in `reports/security/postmortems/`.
* Identify the root cause.
* File a follow-up action item.
