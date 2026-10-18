# Cortex — Feature Status

Legend: ✅ works & verified · 🟡 partial / unverified in prod · ❌ missing or broken.
"Prod" means the deployment at `13.60.95.116`. Updated as work lands; see IMPLEMENTATION_PLAN.md for the checklist.

| ID | Requirement | Pri | Code today | Tests | Prod | Gap / next action |
|---|---|---|---|---|---|---|
| FR-ID-01 | Create tenant with isolated data | P0 | ✅ `POST /auth/register`, `POST /tenants` | ✅ unit+integration | ✅ 16 tenants | Cross-tenant tests for every resource (H-series) |
| FR-ID-02 | Invite users with role owner/admin/member/viewer | P0 | ❌ only `/users/me` | ❌ | ❌ | H6: invite + role change endpoints |
| FR-AUTH-01 | JWT for users, API key for programs | P0 | 🟡 JWT ok; API key upload crashes (C4) | 🟡 | ❌ 0 keys exist | C4, C5 |
| FR-AUTH-02 | API keys scoped, hashed, independently rate-limited | P0 | 🟡 scoped + bcrypt-hashed + revocable; O(N) scan; no per-key limit | 🟡 | ❌ | C5, H5 |
| FR-ING-01 | Upload PDF/DOCX/TXT/MD or URL | P0 | 🟡 files yes; URL no | ✅ parsers | ❌ embed model retired (C1) | H7, C1 |
| FR-ING-02 | Async ingestion, visible status, idempotent retry | P0 | 🟡 statuses + idempotent chunks; stuck on worker crash | ✅ unit | ❌ (C1) | H10, M2 |
| FR-SEARCH-01 | Full-text + vector, fused, then reranked | P0 | 🟡 hybrid + RRF yes; rerank no-op | ✅ unit | ❌ (C1) | H3, H11 |
| FR-CHAT-01 | Multi-turn, token streaming, citations | P0 | 🟡 WS route exists but broken (C3) | 🟡 mocked only | ❌ 0 messages ever | C2, C3 |
| FR-CHAT-02 | Summarize past usable window | P1 | 🟡 manager exists, never called | ✅ unit | ❌ | H8 |
| FR-OBS-01 | Trace + log every LLM call | P1 | 🟡 OTel spans + structlog exist; no exporter configured in prod | 🟡 | 🟡 | Verify span per call; exporter optional |
| FR-BILL-01 | Usage + estimated cost per tenant | P1 | 🟡 tables, pricing, routes; never recorded | 🟡 | ❌ 0 events | H4 |
| FR-BILL-02 | Rate limits per tenant and per API key | P1 | ❌ (agents only) | 🟡 | ❌ | H5 |
| FR-AUDIT-01 | Append-only audit of access/deletion/admin | P1 | 🟡 rows written; not DB-enforced | 🟡 | 🟡 45 rows | H13 |
| FR-AGENT-01 | Bounded multi-step tool-calling agents | P1/P2 | 🟡 executor + limits + tool-call log | ✅ unit | ❌ (C2) | Live run after C2 |
| FR-KG-01 | Entity/relation extraction + traversal | P2 | 🟡 extraction + traversal code | ✅ unit | ❌ task unregistered (H9) | H9 |
| FR-KG-02 | GraphQL cross-entity queries | P2 | 🟡 `/graphql` (Strawberry) | ✅ unit | 🟡 GraphiQL exposed | C8 |
| FR-MCP-01 | MCP tools scoped to one tenant | P2 | 🟡 JSON-RPC over REST/WS; API-key auth broken | 🟡 unit | ❌ (C6) | C6, isolation test |

## Non-functional

| Area | Status | Notes |
|---|---|---|
| TLS in transit | ❌ | C7 |
| Encryption at rest | 🟡 | S3 SSE assumed per `Docs/aws-setup.md` (not verified, no AWS access); EBS encryption unknown |
| Tenant isolation tests | 🟡 | Documents/ingestion covered; search, conversations, usage, audit, MCP need explicit cross-tenant tests |
| Health checks | ✅ | `/health`, `/health/ready` |
| Backups / restore | ❌ | H14 |
| CI/CD | ❌ | H12 (red); no CD |
| Coverage bar | 🟡 | `fail_under = 67` in pyproject, not enforced in CI |
