# Cortex

A multi-tenant AI Knowledge & Agent Platform — turn an organization's documents into a safely queryable, reasoning-capable knowledge base, accessible via REST, GraphQL, WebSockets, and MCP.

---

## Vision

Any organization's private knowledge should be as easy to query, reason over, and act on as a conversation with your sharpest colleague — safely, auditable, and reachable from any interface.

Cortex is the backend for "point this at our company's documents and let people (and AI agents) ask it anything." Instead of hand-rolling RAG, retrieval, and agent infrastructure from scratch, developers and companies plug into Cortex and get a production-grade knowledge layer out of the box — fully isolated per tenant, observable, and cost-accounted from day one.

---

## Features

- **Document ingestion** — upload files or URLs; async parsing, chunking, and embedding off the request path
- **Hybrid search** — full-text (BM25) fused with vector similarity search, plus reranking for relevance
- **Knowledge graph** — entity and relationship extraction that surfaces connections pure semantic search misses
- **Conversational RAG** — streaming, context-aware Q&A over a tenant's own documents
- **Agentic workflows** — multi-step tool-calling agents that can reason and act, not just answer
- **MCP server** — expose the knowledge base as tools for external AI agents, with tenant-scoped auth
- **Multi-tenant architecture** — full data isolation, RBAC (owner/admin/member/viewer), and API key management per tenant
- **Usage metering & rate limiting** — per-tenant cost tracking and configurable rate limits
- **Observability** — OpenTelemetry tracing across the full pipeline, structured logging, and audit trails
- **Multiple access surfaces** — REST, GraphQL (for graph traversal), WebSocket (for streaming), and MCP

---

## Roadmap

Each version ships a working, demoable slice before the next one begins.

| Version | Focus |
|---|---|
| **V0 — Foundations** | Repo scaffolding, Docker Compose, FastAPI skeleton, Alembic init, CI |
| **V1 — Core + Auth** | Tenants, users, JWT/RBAC, document metadata CRUD, S3 upload |
| **V2 — Ingestion Pipeline** | Chunking, background workers, Redis broker/cache, idempotent retries |
| **V3 — RAG Core** | Embeddings, pgvector search, hybrid search + reranking, streaming responses |
| **V4 — Observability & Evals** | OpenTelemetry tracing, structured logging, retrieval evals, cost tracking |
| **V5 — AWS + CI/CD** | Containerized deployment, IAM, Secrets Manager, automated CD |
| **V6 — Agentic Layer** | Agent loop, tool calling, tool registry, safeguards against runaway agents |
| **V7 — Knowledge Graph** | Entity/relation extraction, graph traversal, GraphQL endpoint |
| **V8 — MCP Server** | Tenant-scoped MCP exposure, tested against a real MCP client |
| **V9 — Hardening** | CQRS where justified, load/chaos testing, security audit — ongoing |

---

## Tech Stack

- **Language/Framework:** Python 3.12+, FastAPI
- **Database:** PostgreSQL 16+ with pgvector
- **Caching & Queues:** Redis, Celery / Arq
- **Storage:** S3
- **AI/LLM:** Hosted LLM provider APIs (OpenAI/Anthropic) via an internal adapter
- **Migrations:** Alembic
- **Deployment:** Docker, AWS (ECS Fargate or EC2)
- **CI/CD:** GitHub Actions
- **Observability:** OpenTelemetry

---

## Goals

- Build a genuinely production-grade system, not a demo — with real tenant isolation, observability, and cost control
- Master the full backend + AI engineering stack in one project: async processing, databases, caching, RAG, knowledge graphs, agentic workflows, auth, and cloud deployment
- Ship incrementally — every version must run end-to-end and be demoable in under two minutes
- Tackle real, currently unsolved problems in the space (e.g. multi-tenant MCP auth) rather than solved tutorial exercises
- Produce a portfolio-grade, defensible system where every architectural decision is documented and justified