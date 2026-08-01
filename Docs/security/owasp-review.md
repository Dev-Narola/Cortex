# OWASP API Security Top 10 (2023) Review

V9 Part 3, Task 26.

This document reviews the Cortex platform against the OWASP
API Security Top 10 (2023) and records the finding, the
current mitigation, and the verification method.

| # | Finding | Risk | Current mitigation | Verification |
| - | --- | --- | --- | --- |
| API1 | Broken Object Level Authorization | High | Every repository query is scoped by `tenant_id` (ADR-0002). The PG isolation tests in `tests/unit/identity/` verify cross-tenant access is denied. | Integration test `test_tenant_isolation_*`; chaos test `tests/chaos/test_cross_tenant_attempt.py` |
| API2 | Broken Authentication | High | JWT with refresh tokens (ADR-0006); bcrypt for password hashes; rate limiting on `/auth/login`; audit log on every login attempt. | Unit test `test_auth_*`; load test `tests/load/auth.py` |
| API3 | Broken Object Property Level Authorization | Medium | Response models are explicit Pydantic schemas; mass-assignment is blocked by the request validation layer. | Contract tests `tests/contracts/rest/*.py` |
| API4 | Unrestricted Resource Consumption | High | Per-tenant rate limits in Redis; per-request body size cap; worker concurrency caps; queue depth alerts. | Load test `tests/load/`; chaos test `tests/chaos/test_resource_exhaustion.py` |
| API5 | Broken Function Level Authorization | High | `require_role` dependency on every privileged endpoint; `GraphSecurityPolicy.require_extraction_role` on graph extraction. | Unit test `test_security.py`; integration test `test_authorization.py` |
| API6 | Unrestricted Access to Sensitive Business Flows | Medium | Bulk endpoints are rate-limited per tenant; graph extraction is owner/admin only; agent execution requires the agent to be enabled for the tenant. | Load test `tests/load/business_flows.py` |
| API7 | Server Side Request Forgery | Medium | The platform does not accept user-supplied URLs; outbound URLs are configured at deploy time. MCP tool calls are validated against an allowlist. | Unit test `test_mcp_url_validation.py`; chaos test `tests/chaos/test_ssrf.py` |
| API8 | Security Misconfiguration | High | `SecurityHeadersMiddleware` (V9 Part 3 Task 28); CORS allowlist; HSTS preloaded; CSP locked down; secrets in env / Docker / AWS Secrets Manager only. | Integration test `test_headers.py`; architecture validator `tests/architecture/test_security.py` |
| API9 | Improper Inventory Management | Medium | OpenAPI schema is the source of truth for the REST surface; GraphQL schema is generated from the Strawberry types; MCP tool list is registered in the tool registry. | Contract tests `tests/contracts/`; CI gate `scripts/architecture_check.py` |
| API10 | Unsafe Consumption of APIs | Medium | LLM provider calls go through the resilience layer (retry + circuit breaker); JSON responses are validated against the expected shape; rate limits from the upstream are honoured. | Unit test `test_resilience.py`; chaos test `tests/chaos/test_llm_outage.py` |

## Per-finding detail

### API1 — BOLA

**Status:** Mitigated. **Owner:** Identity team. **Evidence:**
`tests/unit/identity/test_tenant_isolation.py` exercises
cross-tenant access attempts on documents, chunks,
embeddings, conversations, agents, and KG entities.

### API2 — Broken Authentication

**Status:** Mitigated. **Owner:** Identity team. **Evidence:**
`tests/unit/identity/test_auth.py` covers happy + sad path
login, refresh, password reset, and brute-force lockout.

### API3 — BOPLA

**Status:** Mitigated. **Owner:** API team. **Evidence:** the
contract tests under `tests/contracts/rest/` assert that the
response schema for every endpoint includes only the
documented fields.

### API4 — Resource Consumption

**Status:** Mitigated. **Owner:** Platform team. **Evidence:**
the load test scenarios in `tests/load/` confirm the rate
limiter kicks in before the API degrades.

### API5 — Function Level Authorization

**Status:** Mitigated. **Owner:** API team. **Evidence:**
`tests/unit/knowledge_graph/test_security.py` exercises the
extraction role check; every privileged endpoint has a unit
test that asserts the unauthorised response.

### API6 — Sensitive Business Flows

**Status:** Mitigated. **Owner:** Platform team. **Evidence:**
`tests/load/business_flows.py` simulates the bulk ingestion
+ extraction flow and verifies the per-tenant cap.

### API7 — SSRF

**Status:** Mitigated. **Owner:** MCP team. **Evidence:**
`tests/unit/mcp/test_tool_executor.py` includes a test that
attempts a tool call to a private IP and asserts the call
is rejected.

### API8 — Security Misconfiguration

**Status:** Mitigated. **Owner:** Platform team. **Evidence:**
`tests/integration/test_security_headers.py` asserts the
presence of every required header on a sample of
endpoints.

### API9 — Inventory Management

**Status:** Mitigated. **Owner:** API team. **Evidence:**
`scripts/architecture_check.py` fails the build if an
endpoint is added without a corresponding OpenAPI entry.

### API10 — Unsafe API Consumption

**Status:** Mitigated. **Owner:** LLM team. **Evidence:**
`tests/unit/agents/test_resilience.py` includes a test that
simulates an LLM provider outage and asserts the resilience
layer engages.

## Outstanding items

None at the time of writing. Any future finding should
be added to this document with the same schema.
