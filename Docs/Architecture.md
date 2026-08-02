# Architecture.md — Cortex

Companion to `cortex-prd.md` (product requirements) and `cortex-engineering-blueprint.md` (system design, database, API). This document covers three things in detail: the end-to-end client experience, the concrete tech stack, and the actual repository structure.

---

## 1. Client / User Flow

Walkthrough of a brand-new user, screen by screen, from first landing on the product to using every major feature. This describes the client (web UI) that consumes the Cortex API — no frontend exists in the repo yet, so treat this as the spec to build against.

### Step 1 — Landing page (public, unauthenticated)
- **Shows:** product name, one-line pitch ("Ask anything — answered from your own documents"), a short feature list, **Sign Up** and **Log In** buttons.
- **Action:** user clicks **Sign Up** → Step 2.

### Step 2 — Sign Up screen
- **Shows:** form with Name, Email, Password, Confirm Password fields, a **Create Account** button, and a "Log in instead" link.
- **On submit:** client calls `POST /auth/register`. Server creates the user record, hashes the password, issues a JWT.
- **Error states shown inline:** "Email already registered," "Passwords don't match," password-strength hints.
- **Result:** redirect to Step 3.

### Step 3 — Workspace setup (tenant onboarding)
- **Shows:** "Name your workspace" with a single text field (e.g. "Dev's Research" or "Acme Knowledge Base") and a **Continue** button.
- **On submit:** client calls `POST /tenants`. Server creates the tenant and assigns the current user the **owner** role.
- **Alternate branch:** if the user arrived via a teammate's invite link instead of signing up fresh, this screen is skipped entirely — they join the existing tenant with whatever role they were invited as, and land straight on Step 4.
- **Result:** redirect to Step 4.

### Step 4 — Dashboard, empty state
- **Shows:** left sidebar with **Documents / Chat / Agents / Knowledge Graph / Settings**; top bar with workspace name + user avatar; main panel shows "No documents yet" with an **Upload Document** button.
- **Action:** click **Upload Document** → Step 5.

### Step 5 — Upload Document
- **Shows:** a modal with a drag-and-drop zone ("Drop a PDF, DOCX, TXT, or MD file here") and a second tab, **Add from URL**, with a single URL field. An **Upload** button confirms.
- **On submit:** client calls `POST /documents` (multipart for files, JSON for URLs). Server responds immediately with a document id and `status: pending`; the modal closes and a new row appears in the Documents list with a spinner badge.
- **Live updates:** the client opens a status channel (WebSocket) for that document. The badge updates live through `pending → parsing → chunking → embedding → indexed`, no page refresh needed.
- **Failure state:** badge turns red, "Failed — Retry," with a **Retry** button that re-triggers ingestion idempotently (no duplicate chunks created).

### Step 6 — Documents list (populated)
- **Shows:** table with Title, Type, Status, Uploaded date, Uploaded by, and row actions (View / Delete).
- **Action:** clicking a row opens **Step 6b — Document detail**: shows extracted chunks, entities pulled from it (if knowledge-graph extraction has run), and Delete / Reprocess buttons.

### Step 7 — Ask / Chat screen
- **Shows:** empty conversation panel with a text input at the bottom: "Ask anything about your documents…"
- **Action:** user types a question, presses Enter.
- **On submit:** client calls `POST /conversations` (first time) then `POST /conversations/{id}/messages`, and opens a WebSocket to stream the response.
- **While waiting:** a "Thinking…" indicator shows; once generation starts, tokens stream in live.
- **Answer rendering:** the answer includes inline citation markers (`[1]`, `[2]`, …). Clicking one opens a side panel showing the exact source excerpt and a "View full document" link — this is what makes the answer verifiable, not just plausible.
- **Below the answer:** Copy, Regenerate, and an optional thumbs up/down feedback control.

### Step 8 — Multi-turn conversation with agent reasoning
- **Shows:** the same chat panel; a follow-up question is asked and prior context is retained automatically.
- **For questions needing multiple steps** (e.g. "compare what documents A and B say about X"), an expandable **"Agent is working…"** trace appears, showing each step live: "Searching knowledge base…", "Calling comparison tool…", "Synthesizing answer…" — sourced directly from that run's `agent_runs`/`tool_calls` records, so the trace is real, not decorative.

### Step 9 — Conversation history
- **Shows:** a left-hand list of past conversations (ChatGPT-style), each clickable to reopen; rename and delete available per conversation.

### Step 10 — Knowledge Graph explorer (advanced view)
- **Shows:** a node-and-edge graph (entities as nodes, relationships as edges). Clicking a node highlights its connections and lists the source documents it came from. A search bar jumps directly to a named entity.

### Step 11 — Settings
- **Team tab:** member list with roles, "Invite by email" with a role picker, remove-member action.
- **API Keys tab:** table of existing keys (name, scopes, last used), **Generate New Key** button — the raw key is shown exactly once and must be copied immediately (standard security pattern; it's stored hashed after that).
- **MCP Connection tab:** shows the tenant's MCP server URL and a **Generate MCP Token** button, with copy-paste setup instructions for connecting an external MCP client (e.g. Claude) directly to this tenant's knowledge base.
- **Usage & Billing tab:** current-period usage (documents indexed, tokens consumed, estimated cost) and current rate-limit status.
- **Audit Log tab:** searchable, filterable table of every logged action — who did what, and when.

### Cross-cutting states, present on every screen
- **Rate limit hit:** a banner/toast — "You've hit your usage limit for this period" — appears instead of a silent failure.
- **Permission boundaries:** a **viewer**-role user never even sees a Delete button rather than seeing it and getting a server-side rejection — enforced in the UI, mirrored by the server-side RBAC check underneath.
- **Session expiry:** the client silently attempts `POST /auth/refresh` first; only if that fails does it redirect to Login with "Your session expired, please log in again."

---

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Language / runtime | Python 3.12+ | Async-first, matches everything else in the stack |
| Web framework | **FastAPI** | Native async, automatic OpenAPI docs, dependency injection built in |
| ASGI server | Uvicorn (dev) / Gunicorn + Uvicorn workers (prod) | Standard FastAPI deployment pattern |
| Database | **PostgreSQL 16+** with the `pgvector` extension | One database for relational data *and* vector search — no separate vector DB needed at this scale |
| ORM | SQLAlchemy 2.0 (async) | Pairs with FastAPI's async style; explicit enough to actually learn SQL underneath it |
| Migrations | Alembic | Already scaffolded in the repo (`alembic/`) |
| Cache / broker | Redis 7+ | Query-result caching, rate-limit counters, and the task queue broker |
| Background workers | Arq (async-native) — Celery is a fine alternative if that's what `ingestion/workers/tasks.py` is already built against | Ingestion must run off the request path |
| Object storage | AWS S3 (via boto3) | Raw document storage, referenced by `documents.storage_uri` |
| Auth | JWT (PyJWT/python-jose) for sessions, hashed API keys for programmatic access, Argon2/bcrypt for password hashing | Matches the identity module's `security.py` |
| Validation | Pydantic v2 | Native to FastAPI, used for every request/response model |
| GraphQL | Strawberry GraphQL | Type-hint-driven, integrates cleanly with FastAPI — used specifically for knowledge-graph traversal queries |
| Realtime | FastAPI native WebSocket support | Streaming chat tokens and live ingestion status |
| LLM provider (generation, agent reasoning) | Anthropic Claude API, behind `platform/llm_provider.py` | Swappable adapter — business logic never calls the SDK directly |
| Embeddings | Voyage AI or OpenAI embeddings, behind `ingestion/infrastructure/embedding_client.py` | Swappable; re-embedding cost is a known dependency risk, hence the adapter |
| Reranking | Cohere Rerank or a local cross-encoder | Second-pass relevance scoring after hybrid search |
| Knowledge-graph storage | Plain Postgres tables (`kg_entities`, `kg_relations`) | A dedicated graph DB (e.g. Neo4j) is only worth the added complexity if traversal performance later demands it |
| MCP | Official Anthropic MCP Python SDK | Powers `agents/interface/mcp/server.py` and `tools.py` |
| Observability | OpenTelemetry SDK (GenAI semantic conventions), Prometheus-format `/metrics`, structlog for structured JSON logs | Vendor-neutral tracing standard for LLM calls as of 2026 |
| Testing | pytest, pytest-asyncio, httpx async test client, pytest-cov | `.pytest_cache` already present — confirmed |
| Linting / formatting | Ruff | `.ruff_cache` already present — confirmed |
| Containerization | Docker + Docker Compose | `docker/Dockerfile` and `docker-compose.yml` already scaffolded |
| CI/CD | GitHub Actions (`ci.yml` for lint/test, `cd.yml` for build/deploy) | Already scaffolded under `.github/workflows/` |
| Cloud target | AWS — self-managed Postgres on EC2 first, migrating to RDS/ECS only once a specific operational need justifies it; S3 for storage; CloudFront if serving static assets; IAM least-privilege roles; Secrets Manager for credentials; Nginx/ALB as reverse proxy | Matches the deliberate "don't manage-service until you can name why" trade-off from the engineering blueprint |
| Package management | `pyproject.toml`-based — standardize on either `uv` or Poetry (pick one; recommend `uv` for install speed) | One is already present, just needs to be the single source of truth |
| Version control | Git + GitHub | Root repo |

---

## 4. Context Intelligence Layer (V7)

The Knowledge Graph (V7) is the third retrieval source in Cortex's *Context Intelligence Layer* — the band that sits between the agent loop and the LLM. The other two are the vector store (pgvector) and the keyword search (Postgres FTS). The graph adds **structured facts** — entities and the typed relationships between them — that vector hits cannot provide on their own.

```
                       User
                         │
                         ▼
                    Agent Layer
                         │
                         ▼
        ┌────────────────────────────────┐
        │     Context Intelligence       │
        │                                │
        │   ┌──────────────────────┐     │
        │   │  Vector Retrieval    │     │
        │   └──────────────────────┘     │
        │   ┌──────────────────────┐     │
        │   │  Knowledge Graph     │ ◀── V7
        │   └──────────────────────┘     │
        │   ┌──────────────────────┐     │
        │   │  Document Memory     │     │
        │   └──────────────────────┘     │
        └────────────────────────────────┘
                         │
                         ▼
                       LLM
```

* **Vector Retrieval** — semantic similarity over the document chunks (the V3 hybrid search).
* **Knowledge Graph** — typed entities and edges, extracted from documents by the LLM extraction pipeline, fused with vector hits at retrieval time by `GraphVectorFusionService`.
* **Document Memory** — the V2 ingestion store: the canonical document + chunk records.

The graph is **graph-priority**: when a question has graph facts (e.g. "Who created GPT-4?"), the graph answer (`OpenAI CREATED GPT-4`) is rendered *before* the vector hits in the LLM prompt. The fusion service is the only place that knows about both streams, so the V3 retrieval code stays unchanged.

The graph lives in **Postgres** (`kg_entities` + `kg_relations`) per the V1+V3 doc. A forward-compat seam (`GraphDatabaseClient` ABC + `Neo4jSessionManager`) lets a future V9 hardening swap the backend to Neo4j without changing the repositories, services, or interface layers. The forward-compat Cypher index script lives at `src/knowledge_graph/infrastructure/indexes.cypher`.

For the full developer reference (data model, API surface, extraction pipeline, security, observability, troubleshooting) see `Docs/knowledge_graph.md`.

---

## 3. File & Folder Structure

Annotated version of the current repository layout (`d:\Projects\Cortex`). Structure follows hexagonal architecture: every bounded context has its own `domain / application / infrastructure / interface` split.

```
Cortex/                                # Project root
├── Docs/                              # Product & architecture docs
│   ├── cortex-engineering-blueprint.md
│   ├── cortex-prd.md
│   ├── Architecture.md                # ← this file
│   └── file-structure-information.md
│
└── Cortex/                            # Actual application root (see note below)
    ├── .github/workflows/
    │   ├── ci.yml                     # lint + test on every push/PR
    │   └── cd.yml                     # build image + deploy on merge to main
    │
    ├── Docs/adr/                      # Architecture Decision Records — one file per
    │                                  #   non-trivial technology/architecture choice
    │
    ├── alembic/
    │   ├── versions/                  # one migration file per schema change
    │   └── env.py                     # Alembic runtime config
    │
    ├── docker/
    │   ├── Dockerfile                 # app image
    │   └── docker-compose.yml         # local dev: api + worker + postgres + redis
    │
    ├── scripts/
    │   ├── reindex_tenant.py          # manual/admin: rebuild a tenant's index
    │   └── seed_dev_data.py           # local dev: seed sample tenant/docs
    │
    ├── src/
    │   ├── identity/                  # Tenants, users, roles, auth, API keys
    │   │   ├── domain/entities.py
    │   │   ├── application/services.py
    │   │   ├── infrastructure/
    │   │   │   ├── models.py          # SQLAlchemy models
    │   │   │   ├── repositories.py
    │   │   │   └── security.py        # JWT + password hashing
    │   │   └── interface/rest/routes.py
    │   │
    │   ├── ingestion/                 # Upload → parse → chunk → embed pipeline
    │   │   ├── domain/entities.py
    │   │   ├── application/
    │   │   │   ├── chunking.py
    │   │   │   └── services.py
    │   │   ├── infrastructure/
    │   │   │   ├── parser.py          # PDF/DOCX/MD/URL text extraction
    │   │   │   ├── embedding_client.py
    │   │   │   ├── storage.py         # S3 adapter
    │   │   │   └── models.py
    │   │   ├── interface/rest/routes.py
    │   │   └── workers/tasks.py       # async background jobs (Arq/Celery)
    │   │
    │   ├── retrieval/                 # Hybrid search, reranking, knowledge graph
    │   │   ├── domain/entities.py
    │   │   ├── application/
    │   │   │   ├── hybrid_search.py   # BM25 + vector fusion
    │   │   │   ├── reranker.py
    │   │   │   └── kg_extraction.py   # entity/relation extraction
    │   │   ├── infrastructure/
    │   │   │   ├── vector_repository.py
    │   │   │   └── graph_repository.py
    │   │   └── interface/
    │   │       ├── rest/routes.py
    │   │       └── graphql/schema.py  # Strawberry schema for graph traversal
    │   │
    │   ├── conversation/               # Chat sessions, streaming, context management
    │   │   ├── domain/entities.py
    │   │   ├── application/
    │   │   │   ├── services.py
    │   │   │   └── context_manager.py # summarization once context window fills
    │   │   ├── infrastructure/repositories.py
    │   │   └── interface/
    │   │       ├── rest/routes.py
    │   │       └── websocket/handlers.py
    │   │
    │   ├── agents/                    # Tool-calling agent loop + MCP exposure
    │   │   ├── domain/entities.py
    │   │   ├── application/
    │   │   │   ├── agent_loop.py
    │   │   │   └── tool_registary.py  # note: consider renaming → tool_registry.py
    │   │   ├── infrastructure/repositories.py
    │   │   └── interface/
    │   │       ├── rest/routes.py
    │   │       └── mcp/
    │   │           ├── server.py      # tenant-scoped MCP server
    │   │           └── tools.py       # search_knowledge_base, ask_knowledge_base, etc.
    │   │
    │   ├── billing/                   # Usage metering + rate limiting
    │   │   ├── domain/entities.py
    │   │   ├── application/rate_limitor.py  # note: consider renaming → rate_limiter.py
    │   │   ├── infrastructure/redis_counter.py
    │   │   └── interface/rest/routes.py
    │   │
    │   ├── observability/             # Tracing, metrics, audit log
    │   │   ├── tracing.py             # OpenTelemetry spans
    │   │   ├── metrics.py             # Prometheus-format /metrics
    │   │   ├── audit_log.py
    │   │   └── interface/rest/routes.py   # /health, /health/ready, /metrics
    │   │
    │   ├── platform/                  # Cross-cutting infra, no business logic
    │   │   ├── config.py
    │   │   ├── database.py            # async SQLAlchemy engine/session
    │   │   ├── redis_client.py
    │   │   ├── secrets.py
    │   │   ├── llm_provider.py        # Claude adapter
    │   │   ├── middleware.py
    │   │   ├── logging.py
    │   │   └── dependencies.py        # shared FastAPI DI providers
    │   │
    │   ├── shared/                    # Utilities with no owning module
    │   │   ├── exceptions.py
    │   │   ├── pagination.py
    │   │   ├── response_builder.py
    │   │   └── responses.py
    │   │
    │   ├── api.py                     # Mounts every module's router
    │   └── main.py                    # FastAPI app entrypoint
    │
    ├── tests/
    │   ├── unit/
    │   ├── integration/
    │   └── conftest.py
    │
    ├── .env.example
    ├── .gitignore
    ├── alembic.ini
    ├── pyproject.toml
    └── README.md
```

**Housekeeping notes worth a quick pass:**
- The repo currently has a `Cortex/Cortex/` nesting — the real application root is the inner folder. Worth flattening at some point so the project root and the app root are the same directory; it's harmless now but gets confusing as the repo grows.
- `.pytest_cache/` and `.ruff_cache/` appear at both the outer and inner level, which is a symptom of the nesting above (tools were run from both directories at some point) — make sure both are `.gitignore`d, and it'll sort itself out once flattened.
- Two filenames have likely typos worth a quick rename for consistency: `tool_registary.py` → `tool_registry.py`, and `rate_limitor.py` → `rate_limiter.py`.
- There's a stray `test.txt` at the project root — safe to delete if it's not intentional.
