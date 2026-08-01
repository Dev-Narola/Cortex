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
| **V9 — Production Hardening & Enterprise Readiness** | CQRS, read models, distributed locking, multi-level cache, resilience (retry/CB/fallback), OWASP review, secret rotation, chaos tests, backup/DR, 10 runbooks, contract + performance regression + architecture validation, CI quality gates, governance docs, **v1.0.0 release** |

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

---

## Quick start (local development)

```bash
# 1. Clone and install
git clone https://github.com/<your-org>/cortex.git
cd cortex/Cortex
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\Activate.ps1
pip install -e ".[dev]"

# 2. Configure
cp .env.example .env
# Edit .env: at minimum set OPENAI_API_KEY

# 3. Bring up the local stack (Postgres + Redis + MinIO + API + worker)
docker compose -f Docker/docker-compose.yml up -d

# 4. Apply migrations
alembic upgrade head

# 5. Verify
curl http://localhost:8000/health
# {"status":"ok"}
```

The dev compose file (in `docker/`) brings up the full platform
with hot-reload and MinIO as a local S3-compatible store. The
production stack is a separate compose file at the repo root
(`Docker/docker-compose.prod.yml`) — see the next section.

---

## Production deployment

The V5 stack runs on a single EC2 host behind an ALB. The
host runs the full platform (api + worker + postgres + redis +
nginx) from one image via `Docker/docker-compose.prod.yml`. Secrets
come from AWS Secrets Manager, files from S3, certificates
from ACM.

### One-time setup

| Document | What it covers |
|---|---|
| [`docs/aws-setup.md`](docs/aws-setup.md) | IAM roles, S3, Secrets Manager, security groups, EC2, optional ALB + ACM + Route 53 |
| [`docs/deployment.md`](docs/deployment.md) | First-time host bootstrap, day-to-day operations, troubleshooting |

### Routine operations

```bash
# Deploy (run from the EC2 host, or via the CD pipeline)
./scripts/deploy.sh --image-tag sha-abcdef1

# Roll back to the previous known-good image
./scripts/deploy.sh --image-tag "$(cat .last-good-tag)"

# Stop the api + worker only (keep db + redis up)
docker compose -f Docker/docker-compose.prod.yml stop api worker

# Bring the entire stack down (volumes preserved)
docker compose -f Docker/docker-compose.prod.yml down

# Bring the stack down AND delete the volumes (destructive!)
docker compose -f Docker/docker-compose.prod.yml down -v
```

### CI / CD

| Document | What it covers |
|---|---|
| [`docs/ci-cd.md`](docs/ci-cd.md) | How CI builds images, how CD deploys, required GitHub secrets, common failure modes |
| `.github/workflows/ci.yml` | Lint + test + build + push to GHCR |
| `.github/workflows/cd.yml` | SSH to EC2, run `deploy.sh`, smoke test, notify on failure |

### Backups

| Document | What it covers |
|---|---|
| [`docs/backup.md`](docs/backup.md) | Nightly `pg_dump` to a private S3 bucket, weekly snapshots, test-restore procedure, disaster recovery |
| `scripts/backup.sh` | The script the host's crontab runs nightly |

### Monitoring

The V4 observability surface carries forward unchanged:

* `/health` — liveness probe (always 200 if the process is up)
* `/health/ready` — readiness probe (checks Postgres + Redis)
* `/metrics` — Prometheus exposition format

The nginx config (`docker/nginx/default.conf`) restricts
`/metrics` to the private network so it is not exposed
publicly. The ALB target group should poll `/health`.

### What V5 deliberately does not include

Calling these out so the operator does not go looking:

* **No auto-scaling.** Single host, fixed capacity.
* **No multi-region.** Single EC2, single point of failure.
* **No managed databases.** Postgres runs as a container on
  the same host; the blueprint's "self-managed first"
  trade-off.
* **No secret rotation automation.** Rotating a secret
  means updating it in Secrets Manager and restarting the
  api/worker. A rotation Lambda is a V9 hardening item.
* **No blue/green or canary deploys.** The CD pipeline does
  a rolling restart with a 120-second health window and
  rolls back to the last known good tag on failure. More
  sophisticated deploys require a second host or ECS.

---

## Repository layout

```
Cortex/
├── docs/                           # Operational docs (V5)
│   ├── deployment.md               # First-time bootstrap + day-to-day ops
│   ├── aws-setup.md                # IAM, S3, Secrets Manager, EC2, ALB
│   ├── ci-cd.md                    # CI/CD pipeline reference
│   └── backup.md                   # Postgres + S3 backup / restore
│
├── Docker/                         # All Docker assets (V5 consolidation)
│   ├── Dockerfile                  # Production multi-stage image
│   ├── Dockerfile.dev              # Dev image (hot-reload, no entrypoint)
│   ├── docker-compose.yml          # Dev stack (Postgres + Redis + MinIO + app)
│   ├── docker-compose.prod.yml     # Production stack (api + worker + db + redis + nginx)
│   ├── nginx/                      # Production nginx (read-only mount in prod compose)
│   │   ├── nginx.conf
│   │   └── default.conf
│   └── postgres/                   # Production postgres config (read-only mount)
│       └── postgresql.conf
│
├── scripts/
│   ├── start.sh                    # Production entrypoint (secrets, migrations, exec)
│   ├── deploy.sh                   # One-command production deploy
│   ├── backup.sh                   # Nightly postgres backup to S3
│   └── ...                         # Dev scripts (smoke tests, seed, evals)
│
├── src/                            # Application source (hexagonal, per context)
│   ├── core/                       # Cross-cutting (config, db, secrets, logging)
│   ├── identity/                   # Tenants, users, JWT, RBAC, API keys
│   ├── ingestion/                  # Upload → parse → chunk → embed
│   ├── retrieval/                  # Hybrid search, reranking, KG
│   ├── conversation/               # Chat sessions, streaming
│   ├── agents/                     # (V6) Tool-calling, MCP
│   ├── billing/                    # Usage metering, rate limiting
│   ├── observability/              # Tracing, metrics, audit log
│   ├── shared/                     # Cross-cutting helpers
│   ├── api.py                      # Mounts every module's router
│   └── main.py                     # FastAPI app entrypoint
│
├── tests/                          # Unit + integration + evals
│
├── .github/workflows/
│   ├── ci.yml                      # Lint + test + build + push (V5)
│   └── cd.yml                      # Deploy to EC2 via SSH (V5)
│
├── .dockerignore                   # Build context exclusions (lives at repo root by Docker convention)
├── .env.example                    # Env var template (no real secrets)
├── alembic/                        # Database migrations
├── pyproject.toml                  # Project metadata + dependencies
└── README.md                       # This file
```