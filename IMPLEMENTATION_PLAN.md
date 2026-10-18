# Cortex — Implementation Plan

Branch: `fix/production-recovery` (from `main` @ `fe68d2c`, tag `pre-audit-2026-10-18`).
Constraint: the developer machine is weak. No local Docker stacks. Local = code + targeted unit tests;
integration tests run in GitHub Actions (pgvector service); live verification on the EC2 host.

Issue IDs refer to PROJECT_AUDIT.md.

## Phase Alpha — make the core work end to end

- [x] A1 Provider recovery (C1, C2, H2): one embedding factory used for both query and passage; NVIDIA
      `nemotron-3-embed-1b` @ 2048; `LLM_PROVIDER=nvidia` / `openai/gpt-oss-20b`; fold in server hotfixes.
- [x] A2 Schema (H1): migration → `embedding halfvec(2048)` + HNSW `halfvec_cosine_ops`; ORM matches;
      startup check that `EMBEDDING_DIMENSIONS` matches the column.
- [x] A3 Chat (C3, H8): sync session for repositories inside the WS route and history loading;
      summarization wired. **Not done:** REST SSE chat for API-key clients (they use MCP `ask_knowledge_base`).
- [x] A4 API keys (C4, C5, C6): `key_lookup` (SHA-256, unique) + `created_by`; O(1) resolver shared by
      REST, ingestion, MCP. Legacy keys (none in prod) must be re-issued, no lazy upgrade.
- [x] A5 Invites/roles (H6): `GET/POST /users`, `PATCH /users/{id}` (role/active), owner/admin only, audited.
- [x] A6 Ingestion reliability (H10, H11, H15, M1, M2): crash re-entry, compare-and-set claim, null-embedding
      filter, search-cache version bump, size-first validation, safe object keys.
- [x] A7 URL ingestion (H7) with SSRF guard.
- [x] A8 Reranking (H3): LLM reranker with flagged fallback.
- [x] A9 Tests: regression tests for every fix above + cross-tenant tests for search/conversations/usage/MCP.

Gate: unit suite green locally; CI integration job green (migrations + live pgvector search); live smoke on prod.

## Phase Beta — operate it

- [x] B1 Usage accounting (H4): provider-reported tokens for embed/complete/rerank → `usage_events`.
- [x] B2 Rate limits (H5): per tenant + per API key, Redis, 429 + `Retry-After`.
- [x] B3 Audit immutability (H13): DB trigger.
- [x] B4 Ops exposure (C8, M3–M6): ops routes off `/api/v1`, GraphiQL off in prod, prod config validation,
      worker healthcheck, S3 label, quiet third-party HTTP loggers (M6).
- [x] B5 CI (H12): fix steps, pgvector integration job, coverage gate.
- [x] B6 Backups + TLS live; CD workflow ready (needs repo secrets).

## Phase v1.0 — differentiated capabilities

- [x] V1 KG extraction registered in worker (H9); worker deadlock + reasoning-budget fixes; verified live.
- [x] V2 Agent run hard wall-clock bound (unit-tested). ⏳ live agent run after deploy.
- [x] V3 MCP tenant isolation tests (API key + JWT), user re-resolved (M7).

## Phase v1.x — hardening

- [ ] Load test (k6/locust against staging-sized data), OWASP API Top 10 pass, restore drill.
- CQRS / dedicated vector DB: not justified at 3 documents / 109 chunks; revisit with evidence.

## Progress log

| Date | Commit | Change | Tests |
|---|---|---|---|
| 2026-10-18 | 4b726c2 | Audit docs | — |
| 2026-10-18 | 9caca20 | A1/A2/A8/B1: providers, halfvec(2048), LLM reranker, real usage, KG task | embedding/retrieval units |
| 2026-10-18 | 1b8069a | A3/A4/V3: WS chat, summaries, O(1) API keys, MCP tools | WS, API-key, MCP isolation |
| 2026-10-18 | c9c1eb9 | B4: ops endpoints, bounded probes, worker health, redis | health |
| 2026-10-18 | dbfe76a | A6: crash-safe resume, committed retries, cache version | worker recovery |
| 2026-10-18 | 0c0b04b | A5: invites, roles | user management |
| 2026-10-18 | 07f7bce | A7: URL ingestion + SSRF guard | 20 SSRF cases |
| 2026-10-18 | 74908d7 | B2: rate limits | rate limits |
| 2026-10-18 | 3d321ad | B3: audit trigger | live (CI) |
| 2026-10-18 | 1976c1a | B5/B6 (code): CI, CD, backups, compose env | full suite 949 passed, 77.2 % |
| 2026-10-18 | 76aff6f | V2: agent wall-clock bound, re-embed script, ADRs | agent bound |

| 2026-10-18 | aa25f5c | First production deploy; migrations w1-w4; re-embed | smoke: core passes, KG stalled |
| 2026-10-18 | 5c632b2 | KG worker deadlock fix (no txn across awaits, lock_timeout) | CI green; worker verified live |
| 2026-10-18 | 76e354c | NIM reasoning_effort=low (KG JSON was truncated) | prod smoke 16/16 (HTTP, HTTPS) |

**Remaining:** merge `fix/production-recovery` → `main` (PR), CD repo secrets, a live agent run,
load test + restore drill + OWASP write-up (v1.x), mypy debt (116), architecture baseline (55).
