# Product Requirements Document: Cortex

| | |
|---|---|
| **Product** | Cortex (working name) — Multi-tenant AI Knowledge & Agent Platform |
| **Version** | 1.0 |
| **Status** | Draft |
| **Date** | July 18, 2026 |
| **Companion doc** | `cortex-engineering-blueprint.md` (architecture, database schema, API design, version-by-version technical roadmap — this PRD is scoped to product requirements and defers deep technical design to that document) |

---

## 1. Overview

Cortex is a multi-tenant backend platform that turns an organization's unstructured documents into a queryable, reasoning-capable knowledge base. Users upload or connect documents; the platform ingests, chunks, embeds, and indexes them with hybrid (keyword + vector) search and a knowledge graph; humans and AI agents can then query that knowledge conversationally, with tool-calling, streaming responses, and access via REST, GraphQL, WebSockets, and an MCP server. Every tenant's data is isolated, every action is auditable, and every LLM call is traced and cost-accounted.

Built and owned solo, as a flagship portfolio project, with the developer's own research and study workflow as the first real tenant.

---

## 2. Problem Statement

- Knowledge inside organizations (and inside an individual's own research) is scattered across documents, wikis, and notes, and is expensive to search and reason over well.
- Basic RAG demos are easy to build; production-grade RAG is not. The gaps that separate the two are specific and well documented: keeping retrieval accurate as data changes, understanding relationships between pieces of information that pure semantic similarity misses, and controlling exactly who (or which agent) can see what.
- Most personal or hackathon-grade RAG projects skip multi-tenancy, auth, rate limiting, and observability entirely — which is precisely the part of the system that real engineering jobs are built around.
- Existing hosted RAG tools solve the product problem but hide the internals; existing agent frameworks solve the reasoning problem but ship without a knowledge layer attached. Nothing solo-buildable currently forces both at once.

---

## 3. Goals and Non-Goals

**Goals**
- **G1 — Ship something real, fast.** A working, multi-tenant RAG core (auth + ingestion + hybrid search + streaming chat) usable end-to-end within the first phase, not after months of scaffolding.
- **G2 — Reach full differentiated capability.** Agentic tool-calling, a knowledge graph, and an MCP server on top of the RAG core, so the finished platform is a genuine step beyond a basic RAG chatbot.
- **G3 — Serve as a defensible portfolio artifact.** Every architectural decision should be one the developer built and can explain in depth in an interview, not a wired-together stack of hosted services.
- **G4 — Preserve founder optionality.** The platform should be structured so it *could* be open-sourced or spun into a real product later, without that being a requirement now.

**Non-Goals (explicitly out of scope for this product)**
- Training or fine-tuning models — Cortex consumes hosted LLM APIs.
- Being a general-purpose workflow/automation tool (Zapier-style) — the domain is knowledge and reasoning, not arbitrary business process automation.
- Being a consumer note-taking or PKM app — Cortex is API-first infrastructure, not a personal writing surface.
- Hyperscale distributed-systems concerns (multi-region, sharding, service mesh) — deliberately out of scope; a modular monolith on one Postgres instance is the right scale for this product.
- A polished end-user frontend — a thin client may exist later, but the product *is* the API.

---

## 4. Target Users & Personas

### 4.1 Primary — "Priya," Knowledge-Ops Lead
- **Context:** works at a mid-size company where institutional knowledge lives across docs, wikis, and Slack threads.
- **Goal:** make that knowledge answerable in plain language without a months-long integration project.
- **Pain today:** existing internal search is keyword-only and misses context; nobody trusts the answers enough to skip checking the source doc.
- **How Cortex helps:** hybrid search + reranking + citations back to source chunks, so answers are both accurate and verifiable.

### 4.2 Secondary — "Sam," Developer Integrating AI Features
- **Context:** building an AI feature into their own product and doesn't want to hand-roll chunking, embeddings, and retrieval from scratch.
- **Goal:** an API-first backend they can point their app at, the same job commercial RAG-infrastructure providers do.
- **How Cortex helps:** REST/GraphQL API, API-key auth, usage metering — consumable the way any third-party platform API is.

### 4.3 Tertiary (dogfood) — the developer, as Tenant Zero
- **Context:** running their own research notes, papers, and roadmap tracking through the platform as its first real user.
- **Goal:** a genuinely useful personal research tool *and* proof the platform works end-to-end before anyone else touches it.
- **How Cortex helps:** this is the origin of the product — the same instinct as the original single-user research-workspace idea, now running on multi-tenant rails instead of being a one-off script.

---

## 5. Use Cases & User Stories

Format: *As a [persona], I want to [action], so that [benefit].* Acceptance criteria given per story.

### Identity & Access
- **US-1.** As a tenant owner, I want to invite teammates with a specific role, so that access matches responsibility.
  - AC: roles are owner/admin/member/viewer; a viewer cannot delete documents; only owner/admin can invite.
- **US-2.** As a developer, I want to authenticate with an API key instead of a user session, so that I can integrate programmatically.
  - AC: keys are scoped, hashed at rest, revocable, and rate-limited independently per key.

### Ingestion
- **US-3.** As Priya, I want to upload a PDF/DOCX/Markdown file or a URL, so that its content becomes searchable.
  - AC: upload returns immediately; processing happens asynchronously; status is visible (pending → parsing → chunking → embedding → indexed/failed).
- **US-4.** As a tenant owner, I want failed ingestion to be retried safely, so that a transient failure doesn't require re-uploading or produce duplicate chunks.
  - AC: retries are idempotent — a document reprocessed twice produces exactly one set of chunks.

### Retrieval & Conversation
- **US-5.** As Priya, I want to ask a question in plain language and get an answer grounded in our documents, so that I don't have to search manually.
  - AC: response streams token-by-token; every claim is traceable to specific source chunks; results combine keyword and semantic relevance, then rerank before generation.
- **US-6.** As a user, I want a multi-turn conversation to remember earlier context, so that follow-up questions work naturally.
  - AC: conversation history is retained and summarized once it exceeds the model's usable context window.

### Agents & Tools
- **US-7.** As Sam, I want the system to answer multi-step questions that require several retrieval or computation steps, so that it can handle more than single-hop lookups.
  - AC: agent runs are capped at a maximum step count and time budget, with every tool call logged.

### Knowledge Graph
- **US-8.** As Priya, I want the system to surface how two documents or entities relate, not just that they're semantically similar, so that I can understand context, not just find keywords.
  - AC: entity/relation extraction runs on ingested content; a graph-traversal query returns related entities and their source documents.

### MCP / External Access
- **US-9.** As Sam, I want to point an MCP-compatible AI client (e.g. Claude) directly at our tenant's knowledge base, so that any MCP client can use it without custom integration.
  - AC: MCP tools are scoped to a single authenticated tenant; no tool call can return another tenant's data, under test.

### Billing & Audit
- **US-10.** As a tenant owner, I want to see usage and estimated cost per period, so that I'm not surprised by LLM spend.
  - AC: every embedding/completion/rerank call records a usage event with a cost estimate, queryable per tenant.
- **US-11.** As a tenant owner, I want an audit trail of who accessed or changed what, so that I can answer "who did this" after the fact.
  - AC: audit log is append-only and covers document access, deletion, and admin actions at minimum.

---

## 6. Scope

| Phase | Maps to blueprint versions | Includes |
|---|---|---|
| **Alpha** (internal use only) | V0–V3 | Tenants, auth/RBAC, document upload, async ingestion, hybrid search, reranking, streaming RAG chat |
| **Beta** (demoable & deployed) | V4–V5 | + Full observability (tracing/metrics/cost), AWS deployment, CI/CD |
| **v1.0** (fully differentiated) | V6–V8 | + Agentic tool-calling, knowledge graph, MCP server |
| **v1.x** (ongoing hardening) | V9+ | + CQRS where justified, vector-DB migration if justified, load/chaos testing, security audit |

**Explicitly deferred to a possible future version, not this one:**
- Live/real-time data connectors (e.g. continuous Slack or Gmail sync)
- Human-in-the-loop review/approval workflows
- Enterprise SSO/SAML
- A marketplace of third-party tools for the agent layer
- A polished end-user web frontend (an existing Next.js app could serve this later, but it is not part of this PRD's scope)

---

## 7. Functional Requirements

Priority: **P0** = required for Alpha, **P1** = required for Beta/v1.0, **P2** = required for full v1.0 differentiation.

| ID | Requirement | Priority |
|---|---|---|
| FR-ID-01 | System supports creating a tenant with fully isolated data | P0 |
| FR-ID-02 | Users can be invited to a tenant with a role (owner/admin/member/viewer) | P0 |
| FR-AUTH-01 | Interactive users authenticate via JWT; programmatic clients authenticate via API key | P0 |
| FR-AUTH-02 | API keys are scoped, hashed at rest, and independently rate-limited | P0 |
| FR-ING-01 | Users can upload documents (PDF, DOCX, TXT, MD) or submit a URL | P0 |
| FR-ING-02 | Ingestion runs asynchronously with visible status, retried idempotently on failure | P0 |
| FR-SEARCH-01 | Search combines keyword (full-text) and vector similarity, then reranks results | P0 |
| FR-CHAT-01 | Conversations are multi-turn, streamed token-by-token, and grounded with source citations | P0 |
| FR-CHAT-02 | Conversation context is summarized once it exceeds the model's usable window | P1 |
| FR-OBS-01 | Every LLM call (embedding, completion, rerank) is traced and logged | P1 |
| FR-BILL-01 | Usage (tokens, storage, requests) is metered per tenant with an estimated cost | P1 |
| FR-BILL-02 | Requests are rate-limited per tenant and per API key | P1 |
| FR-AUDIT-01 | All document access and admin actions are recorded in an append-only audit log | P1 |
| FR-AGENT-01 | The system can execute multi-step agent runs with tool calling, bounded by a max step count and time budget | P1/P2 |
| FR-KG-01 | Entities and relationships are extracted from ingested content and queryable via graph traversal | P2 |
| FR-KG-02 | A GraphQL endpoint supports flexible cross-entity traversal queries | P2 |
| FR-MCP-01 | Platform capabilities (search, ask, get document) are exposed as MCP tools scoped to a single authenticated tenant | P2 |

---

## 8. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Performance** | p95 search+rerank latency under a defined target (set once real hardware/data volumes are known); first streamed token under ~1s under normal load |
| **Tenant isolation** | Zero cross-tenant data leakage — verified by explicit automated tests, not assumed from schema design alone |
| **Security** | TLS in transit always; encryption at rest for document content; secrets never committed to source control; passes an OWASP API Top 10 self-review before Beta |
| **Reliability** | Ingestion is idempotent and safely retryable; a killed worker mid-ingestion must not corrupt or duplicate data |
| **Observability** | 100% of LLM calls produce a trace span; structured logs; liveness and readiness health checks present from Beta onward |
| **Cost visibility** | Per-tenant cost is queryable at all times, not reconstructed after the fact |
| **Maintainability** | A minimum enforced test-coverage bar; one ADR entry per non-trivial technology or architecture decision, starting at Alpha |
| **Auditability** | Audit log is immutable (append-only) and retained indefinitely for this project's lifetime |

---

## 9. System & Technical Constraints

This PRD assumes the technical stack and architecture defined in the companion Engineering Blueprint: Python/FastAPI, PostgreSQL with pgvector, Redis, Celery/Arq workers, Docker Compose locally, AWS for deployment, GitHub Actions for CI/CD. Deep schema, API contracts, and infrastructure decisions live in that document, not here.

---

## 10. Assumptions & Dependencies

- Assumes ongoing access to a hosted LLM API (Anthropic/OpenAI) at acceptable cost for development-scale usage.
- Assumes solo development with no team — process overhead (sprint ceremony, multi-reviewer approval) is deliberately not part of this PRD.
- V5 onward assumes an AWS account and a development budget for cloud costs.
- Assumes the embedding model choice may change over the project's life, which is a known dependency risk (re-embedding cost, vendor pricing changes) rather than a one-time decision.

---

## 11. Success Metrics

Since this is a portfolio project rather than a live business, success is measured against completion, quality, and defensibility rather than revenue:

- **Functional:** % of P0 requirements shipped and demoable at each phase gate (Alpha/Beta/v1.0).
- **Technical health:** test coverage against the enforced bar; p95 latency against target; zero cross-tenant leakage across all isolation tests.
- **Portfolio impact:** every architectural decision can be explained and defended unaided in an interview setting; a working public demo or repository exists; technical write-ups are published per phase.
- **Stretch:** real external users adopt it if it's ever open-sourced.

---

## 12. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Scope creep returns (the original "build everything first" pattern) | Strict P0/P1/P2 tiers; nothing below P0 is started before Alpha ships |
| LLM API cost overruns during heavy development/testing | Per-tenant cost tracking from Beta onward; use smaller/cheaper models during iteration |
| Solo burnout on a project explicitly designed to "never end" | Concrete phase gates (Alpha/Beta/v1.0) provide real closure points even though hardening continues after |
| Multi-tenant MCP auth is an open problem industry-wide, not a solved pattern | Scope MCP auth pragmatically (per-tenant OAuth) rather than attempting to solve the general protocol gap |
| Cloud complexity stalls momentum during Beta | Start on self-managed EC2 + Postgres before considering managed RDS/ECS, and only migrate once a specific operational pain justifies it |

---

## 13. Open Questions

- Does the existing FastAPI product's domain already overlap with Cortex, making this its next phase rather than a separate effort?
- Final public product name — "Cortex" is a working title and needs a trademark/availability check before any public release.
- Long-term disposition: stays a private portfolio artifact, or gets open-sourced / spun into a real product?

---

## 14. Appendix — Glossary

- **RAG (Retrieval-Augmented Generation):** generating answers grounded in retrieved source content rather than model memory alone.
- **Hybrid search:** combining keyword (full-text) and vector (semantic) search results.
- **Reranking:** a second-pass model that reorders initial search results by relevance.
- **Knowledge graph:** entities and their relationships, queryable independently of semantic similarity.
- **Tenant:** an isolated customer/organization within the multi-tenant system; all data is scoped to one.
- **MCP (Model Context Protocol):** a standard letting AI clients discover and call external tools/data sources.
