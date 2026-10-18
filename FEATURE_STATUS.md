# Cortex — Feature Status

Legend: ✅ implemented and tested · 🟡 partial · ❌ missing · ⏳ not yet verified in production.
"Tests" = local suite (949 passed, 77.2 % coverage) unless marked *live* (Postgres/pgvector in CI).
Production (https://13-60-95-116.sslip.io) runs this branch since 2026-10-18; ✅ in the Prod column
means verified there by `scripts/smoke_e2e.py` (16/16 checks over HTTPS/WSS, 2026-10-18 09:45 UTC).

| ID | Requirement | Code (branch `fix/production-recovery`) | Tests | Prod |
|---|---|---|---|---|
| FR-ID-01 | Tenant with isolated data | ✅ | ✅ cross-tenant tests: documents, API keys, users, WS chat, MCP, search (*live*) | ✅ |
| FR-ID-02 | Invite with owner/admin/member/viewer | ✅ invite token + accept, role change, deactivate, last-owner guard | ✅ `test_user_management.py` | ⏳ deployed, not exercised by the smoke test |
| FR-AUTH-01 | JWT for users, API keys for programs | ✅ documents, search via MCP, MCP; REST search/chat stay JWT | ✅ | ✅ |
| FR-AUTH-02 | Keys scoped, hashed, revocable, limited per key | ✅ SHA-256 indexed lookup + bcrypt at rest, scopes, revocation, per-key limit | ✅ `test_api_key_auth.py`, `test_rate_limits.py` | ✅ |
| FR-ING-01 | PDF/DOCX/TXT/MD upload or URL | ✅ URL ingestion with SSRF guard | ✅ `test_url_fetcher.py` (20 cases) | ✅ upload + URL (SSRF guard verified) |
| FR-ING-02 | Async, visible status, idempotent retry | ✅ crash-safe resume, CAS claim, committed retry/reprocess | ✅ `test_worker_recovery.py` | ✅ status flow; retry/resume paths only in tests |
| FR-SEARCH-01 | Full-text + vector, fused, reranked | ✅ RRF + LLM reranker (flagged fallback), fresh cache on delete | ✅ unit + *live* tenant-scoped hybrid search | ✅ |
| FR-CHAT-01 | Multi-turn, token streaming, citations | ✅ WS fixed (was never able to complete a turn) | ✅ `test_ws_chat.py` | ✅ streamed, grounded, cited |
| FR-CHAT-02 | Summarize past usable window | ✅ rolling summary + marker | ✅ | ⏳ |
| FR-OBS-01 | Every LLM call traced and logged | 🟡 OTel spans/structlog exist; no trace exporter configured on the host | 🟡 | 🟡 |
| FR-BILL-01 | Usage + estimated cost per tenant | ✅ provider-reported tokens for embed/complete/rerank/summarize; NIM free tier priced $0 | ✅ | ✅ embedding + completion events |
| FR-BILL-02 | Rate limits per tenant and key | ✅ | ✅ | ⏳ deployed, not exercised by the smoke test |
| FR-AUDIT-01 | Append-only audit log | ✅ DB trigger blocks UPDATE/DELETE/TRUNCATE | ✅ *live* | ✅ trigger present in prod schema |
| FR-AGENT-01 | Bounded tool-calling agents | ✅ step/tool caps + hard wall-clock bound, tool calls logged | ✅ | ⏳ no live agent run yet |
| FR-KG-01 | Entity/relation extraction + traversal | ✅ task registered in worker; extraction used a non-existent setting | ✅ unit | ✅ entities extracted (after the worker deadlock fix) |
| FR-KG-02 | GraphQL traversal | ✅ (GraphiQL IDE off in production) | ✅ unit | ⏳ |
| FR-MCP-01 | search / ask / get document, tenant-scoped | ✅ tools fixed + `ask_knowledge_base`, `get_document` | ✅ `test_mcp_api_key_isolation.py` | ✅ |

## Non-functional

| Area | Status |
|---|---|
| TLS in transit | ✅ Let's Encrypt on 13-60-95-116.sslip.io, TLS 1.3, HSTS, HTTP→HTTPS 308; weekly renewal cron |
| Encryption at rest | 🟡 S3 SSE + backup SSE in code; EBS encryption unverified (no AWS console access) |
| Health checks | ✅ `/health`, `/health/live`, `/health/ready` (time-bounded) |
| Backups / restore | ✅ nightly pg_dump (verified) + S3 off-host copy; restore drill not yet run |
| CI/CD | ✅ CI green on the branch; CD needs repo secrets + merge to main |
| Coverage bar | ✅ 75 % enforced (measured 77.2 %) |
| Type checking | 🟡 116 mypy errors, ratcheted (may not grow) |
| Architecture rules | 🟡 49 known layer violations + 6 cycles baselined; new ones fail CI |
