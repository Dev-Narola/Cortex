# Cortex — Implementation Plan

Branch: `fix/production-recovery` (from `main` @ `fe68d2c`, tag `pre-audit-2026-10-18`).
Constraint: the developer machine is weak. No local Docker stacks. Local = code + targeted unit tests;
integration tests run in GitHub Actions (pgvector service); live verification on the EC2 host.

Issue IDs refer to PROJECT_AUDIT.md.

## Phase Alpha — make the core work end to end

- [ ] A1 Provider recovery (C1, C2, H2): one embedding factory used for both query and passage; NVIDIA
      `nemotron-3-embed-1b` @ 2048; `LLM_PROVIDER=nvidia` / `openai/gpt-oss-20b`; fold in server hotfixes.
- [ ] A2 Schema (H1): migration → `embedding halfvec(2048)` + HNSW `halfvec_cosine_ops`; ORM matches;
      startup check that `EMBEDDING_DIMENSIONS` matches the column.
- [ ] A3 Chat (C3, H8): sync session for repositories inside the WS route and history loading;
      summarization wired; REST SSE `POST /conversations/{id}/messages` for API clients.
- [ ] A4 API keys (C4, C5, C6): `key_lookup` (SHA-256, unique) + `created_by`; O(1) resolver shared by
      REST, ingestion, MCP; lazy upgrade of legacy bcrypt-only rows.
- [ ] A5 Invites/roles (H6): `GET/POST /users`, `PATCH /users/{id}` (role/active), owner/admin only, audited.
- [ ] A6 Ingestion reliability (H10, H11, H15, M1, M2): crash re-entry, `_job_id` dedupe, null-embedding
      filter, search-cache version bump, size-first validation, safe object keys.
- [ ] A7 URL ingestion (H7) with SSRF guard.
- [ ] A8 Reranking (H3): LLM reranker with flagged fallback.
- [ ] A9 Tests: regression tests for every fix above + cross-tenant tests for search/conversations/usage/MCP.

Gate: unit suite green locally; CI integration job green (migrations + live pgvector search); live smoke on prod.

## Phase Beta — operate it

- [ ] B1 Usage accounting (H4): provider-reported tokens for embed/complete/rerank → `usage_events`.
- [ ] B2 Rate limits (H5): per tenant + per API key, Redis, 429 + `Retry-After`.
- [ ] B3 Audit immutability (H13): DB trigger.
- [ ] B4 Ops exposure (C8, M3–M6): ops routes off `/api/v1`, GraphiQL off in prod, prod config validation,
      worker healthcheck, quiet loggers, S3 label.
- [ ] B5 CI (H12): fix steps, pgvector integration job, coverage gate.
- [ ] B6 CD + backups + TLS (C7, H14): see DEPLOYMENT_PLAN.md (needs approval).

## Phase v1.0 — differentiated capabilities

- [ ] V1 KG extraction registered in worker (H9); live traversal check.
- [ ] V2 Agent run wall-clock bound per LLM call; live bounded run.
- [ ] V3 MCP tenant isolation tests (API key + JWT), user re-resolved (M7).

## Phase v1.x — hardening

- [ ] Load test (k6/locust against staging-sized data), OWASP API Top 10 pass, restore drill.
- CQRS / dedicated vector DB: not justified at 3 documents / 109 chunks; revisit with evidence.

## Progress log

(updated as work lands: date, change, files, test result)
