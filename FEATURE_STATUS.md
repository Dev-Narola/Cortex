# Cortex — Feature Status

Legend: ✅ implemented and tested · 🟡 partial · ❌ missing · ⏳ not yet verified in production.
"Tests" = local suite (949 passed, 77.2 % coverage) unless marked *live* (Postgres/pgvector in CI).
**Production still runs the pre-audit code** until the deployment in DEPLOYMENT_PLAN.md is approved
and done, so the "Prod" column reflects 13.60.95.116 as of 2026-10-18.

| ID | Requirement | Code (branch `fix/production-recovery`) | Tests | Prod |
|---|---|---|---|---|
| FR-ID-01 | Tenant with isolated data | ✅ | ✅ cross-tenant tests: documents, API keys, users, WS chat, MCP, search (*live*) | ✅ |
| FR-ID-02 | Invite with owner/admin/member/viewer | ✅ invite token + accept, role change, deactivate, last-owner guard | ✅ `test_user_management.py` | ⏳ |
| FR-AUTH-01 | JWT for users, API keys for programs | ✅ documents, search via MCP, MCP; REST search/chat stay JWT | ✅ | ⏳ (API-key upload crashed) |
| FR-AUTH-02 | Keys scoped, hashed, revocable, limited per key | ✅ SHA-256 indexed lookup + bcrypt at rest, scopes, revocation, per-key limit | ✅ `test_api_key_auth.py`, `test_rate_limits.py` | ⏳ |
| FR-ING-01 | PDF/DOCX/TXT/MD upload or URL | ✅ URL ingestion with SSRF guard | ✅ `test_url_fetcher.py` (20 cases) | ⏳ (embedding model retired) |
| FR-ING-02 | Async, visible status, idempotent retry | ✅ crash-safe resume, CAS claim, committed retry/reprocess | ✅ `test_worker_recovery.py` | ⏳ |
| FR-SEARCH-01 | Full-text + vector, fused, reranked | ✅ RRF + LLM reranker (flagged fallback), fresh cache on delete | ✅ unit + *live* tenant-scoped hybrid search | ⏳ |
| FR-CHAT-01 | Multi-turn, token streaming, citations | ✅ WS fixed (was never able to complete a turn) | ✅ `test_ws_chat.py` | ⏳ (0 messages ever) |
| FR-CHAT-02 | Summarize past usable window | ✅ rolling summary + marker | ✅ | ⏳ |
| FR-OBS-01 | Every LLM call traced and logged | 🟡 OTel spans/structlog exist; no trace exporter configured on the host | 🟡 | 🟡 |
| FR-BILL-01 | Usage + estimated cost per tenant | ✅ provider-reported tokens for embed/complete/rerank/summarize; NIM free tier priced $0 | ✅ | ⏳ (0 events) |
| FR-BILL-02 | Rate limits per tenant and key | ✅ | ✅ | ⏳ |
| FR-AUDIT-01 | Append-only audit log | ✅ DB trigger blocks UPDATE/DELETE/TRUNCATE | ✅ *live* | ⏳ |
| FR-AGENT-01 | Bounded tool-calling agents | ✅ step/tool caps + hard wall-clock bound, tool calls logged | ✅ | ⏳ (no LLM credits) |
| FR-KG-01 | Entity/relation extraction + traversal | ✅ task registered in worker; extraction used a non-existent setting | ✅ unit | ⏳ (0 entities) |
| FR-KG-02 | GraphQL traversal | ✅ (GraphiQL IDE off in production) | ✅ unit | ⏳ |
| FR-MCP-01 | search / ask / get document, tenant-scoped | ✅ tools fixed + `ask_knowledge_base`, `get_document` | ✅ `test_mcp_api_key_isolation.py` | ⏳ |

## Non-functional

| Area | Status |
|---|---|
| TLS in transit | ❌ needs a hostname decision (DEPLOYMENT_PLAN D6) |
| Encryption at rest | 🟡 S3 SSE + backup SSE in code; EBS encryption unverified (no AWS console access) |
| Health checks | ✅ `/health`, `/health/live`, `/health/ready` (time-bounded) |
| Backups / restore | ✅ script + verify; ❌ not yet scheduled on the host |
| CI/CD | ✅ workflows written; ⏳ not yet run (branch not pushed) |
| Coverage bar | ✅ 75 % enforced (measured 77.2 %) |
| Type checking | 🟡 116 mypy errors, ratcheted (may not grow) |
| Architecture rules | 🟡 49 known layer violations + 6 cycles baselined; new ones fail CI |
