# ADR-0033: Indexed API-key lookup and request rate limits

**Status:** Accepted
**Date:** 2026-10-18

## Context

API-key authentication bcrypt-checked every key of every tenant on each
request: O(tenants × keys) at ~50 ms each, worst for invalid keys, which made it
an unauthenticated CPU-exhaustion vector. Request rate limiting (FR-AUTH-02,
FR-BILL-02) existed only for agent runs.

## Decision

- Store `api_keys.key_lookup = sha256(raw_key)` with a unique index and
  authenticate with one indexed query. A fast hash is appropriate because keys
  carry 256 bits of randomness, so there's no dictionary to brute-force (bcrypt
  exists for low-entropy passwords). The bcrypt `key_hash` stays as the at-rest
  hash. Keys issued before the migration have no lookup and must be re-issued;
  production had none.
- Keys record their issuer (`created_by`), which is attributed as the
  document creator. API keys never inherit the issuer's role: scopes decide
  (`documents:read|write`), and MCP derives at most `member` from scopes.
- Rate limits run inside the auth dependencies, which already know the tenant
  and key. They are fixed one-minute Redis windows with 429 + `Retry-After`,
  applied per key (`rate_limit_per_min` or `API_KEY_REQUESTS_PER_MINUTE`), per
  tenant (`tenant_limits` row or `TENANT_REQUESTS_PER_MINUTE`), and on login per
  IP + tenant slug (`LOGIN_ATTEMPTS_PER_MINUTE`).
- Limits fail open when Redis is down. Availability wins over a cache outage,
  and readiness already reports Redis.

## Consequences

- Fixed windows allow up to 2× the limit across a window boundary. That's
  acceptable at this scale; a sliding window (sorted set) is the upgrade if
  abuse shows up.
- Every authenticated request costs one Redis round-trip.
