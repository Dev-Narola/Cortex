# Cortex — Project Audit (2026-10-18)

Scope: backend (`Cortex/`), production host `13.60.95.116` (EC2, eu-north-1), CI.
Frontend is out of PRD scope and was not audited.
Recovery point: git tag `pre-audit-2026-10-18`; work branch `fix/production-recovery`.

## How the audit was done

| Check | Result |
|---|---|
| Local test suite (`pytest`, sqlite, mocks) | **884 passed, 1 failed, 4 skipped** in 413 s (one test alone takes 260 s) |
| `ruff check src tests` | 653 findings (445 auto-fixable; ~20 real) |
| `scripts/architecture_check.py` | fails (8 layer violations, 6 context cycles), which stops CI before tests run |
| GitHub Actions on `main` | **failing since ≥ 2026-08-29** (backend: architecture step; frontend: `setup-node` pnpm cache before pnpm is installed) |
| Prod HTTP probes | `/health` 200, `/health/ready` 200 (db ok, redis ok), served by nginx on :80 only |
| Prod host (read-only SSH) | Ubuntu 26.04, 2 vCPU, **908 MB RAM** + 3 GB swap, disk **80 %** used, 5 containers via `docker-compose.prod.yml` |
| Prod DB (read-only counts) | 16 tenants, 0 API keys, 3 documents (all `indexed`), 109 chunks, 5 conversations, **0 messages**, **0 usage events**, **0 KG entities**, 45 audit rows; alembic head `v8_create_mcp_tables`; `embedding vector(1024)` |
| Provider checks (from the prod host, status codes only) | OpenAI key valid but **`insufficient_quota`**; NVIDIA key valid; embedding model in use **retired 2026-08-25 (HTTP 410)**; all NVIDIA rerank endpoints retired; `openai/gpt-oss-20b` chat and `nvidia/nemotron-3-embed-1b` (2048-d) embeddings work |

Not verified (no access): AWS account resources (no AWS CLI locally; IAM/metadata probing was not permitted), Secrets Manager, S3 bucket policy, security groups.

## Findings

Severity: **C** = critical (prod broken or exploitable), **H** = high (PRD requirement unmet / reliability), **M** = medium.

| ID | Sev | Finding | Evidence | Files | Fix | Verify |
|---|---|---|---|---|---|---|
| C1 | C | Embedding model `nvidia/nv-embedqa-e5-v5` is retired, so ingestion and every vector search fail in prod | NVIDIA 410 "reached its end of life on 2026-08-25" | prod `.env`, `core/config.py` | Switch to `nvidia/nemotron-3-embed-1b` (2048-d); column → `halfvec(2048)` + HNSW; re-embed the 3 docs | Live ingest → `indexed`; search returns hits |
| C2 | C | LLM provider `openai` has no credits, so chat, KG extraction, and agents can't generate | OpenAI `insufficient_quota` | prod `.env` | `LLM_PROVIDER=nvidia`, `NVIDIA_MODEL=openai/gpt-oss-20b` (verified 200 + real usage) | Live chat turn streams tokens |
| C3 | C | WebSocket chat can never complete: an `AsyncSession` is passed to sync repositories (`session.get` returns a coroutine), so auth fails, and history loading has the same bug | prod: 5 conversations, **0 messages** | `conversation/interface/websocket/routes.py`, `conversation/application/services.py` | Use a sync `Session` for repo calls (threaded); async session only for search | Regression test + live WS turn |
| C4 | C | Uploading a document with an API key raises `AttributeError` (`ApiKey` has no `user_id`), returning 500 | `ingestion/interface/rest/auth.py` uses `ctx.api_key.user_id`; entity/model have no such field | identity model/entity, ingestion auth | Add `api_keys.created_by` (FK users); fall back to tenant owner for legacy keys | Test: upload via API key → 202 |
| C5 | C | API-key auth bcrypt-checks **every key of every tenant** per request: CPU DoS, and an invalid key costs the most | `core/dependencies.py::require_api_key` loops `tenants.list(10_000)` × `keys` | `core/dependencies.py`, identity repo | Indexed SHA-256 lookup column (`key_lookup`), constant-time compare, bcrypt kept for legacy rows | Test: lookup is one indexed query; revoked key → 401 |
| C6 | C | MCP API-key auth references nonexistent columns (`ApiKeyModel.is_active`, `.user_id`) and crashes; it also scans all keys | `mcp/application/authentication.py` | same | Reuse the shared API-key resolver | MCP test with API key |
| C7 | C | No TLS: JWTs, API keys, and documents travel over plain HTTP | :443 closed; TLS block commented out; `/etc/cortex/tls` empty | `docker/nginx/default.conf` | Let's Encrypt via certbot (needs a hostname; see DEPLOYMENT_PLAN) | `curl https://…/health` |
| C8 | C | Ops endpoints are public: `/api/v1/metrics` (nginx only blocks `/metrics`), `/system/status`, GraphiQL IDE in production | HTTP 200 from the internet | `observability/interface/rest/routes.py`, `main.py`, nginx | Drop the `/api/v1` duplicates of ops routes; disable GraphiQL in prod; nginx allow-list | Probes → 403/404 |
| C9 | C | Production ran with `DEBUG=True` (prod `.env`; the compose merge bug dropped the `DEBUG: "false"` override), so FastAPI debug mode was on in prod | `docker exec cortex-api` env | prod `.env`, compose | `.env` fixed, compose env merge fixed, startup refuses DEBUG in production | container env after deploy |
| H1 | H | Vector dimension drift: ORM `Vector(1024)`, migration `vector(1536)`, prod altered by hand. A fresh deploy is broken and one test fails | `test_document_chunk_model_vector_columns`; prod `vector(1024)` | `ingestion/infrastructure/models.py`, alembic | One migration that sets the column explicitly (see C1) | Test passes; `alembic upgrade` on CI Postgres |
| H2 | H | Prod runs **uncommitted hotfixes** (NVIDIA query/passage embedding selection, token truncation, 400/50 chunks). The next deploy from git would regress them | `git status` on host (5 files); saved to `Docs/audit/prod-server-uncommitted-2026-10-18.diff` | embedding provider, chunking, config | Fold into git properly (query + passage use the same configured provider) | Unit tests |
| H3 | H | No real reranking: `IdentityReranker` is a no-op, so FR-SEARCH-01 is unmet | `retrieval/infrastructure/reranker.py`; NVIDIA rerank APIs retired | retrieval | LLM reranker (one JSON-scored call on the configured LLM), fused-order fallback flagged in results | Unit + live search debug shows `rerank_score` |
| H4 | H | Usage/cost accounting never recorded: `BillableRecorder` is never wired; token counts are 4-chars-per-token guesses | prod `usage_events` = 0 | billing, conversation, embedding | Record provider-reported usage for embed/complete/rerank, with request id; mark unknown tokens as null, never guessed | `GET /tenants/me/usage` after a live chat |
| H5 | H | No per-tenant / per-API-key request rate limiting (only agent runs are limited) | grep: `RateLimiter` only in agents executor | billing/limits | Redis fixed-window limiter as a dependency on authenticated routes; per-key limit column | Test: 429 after N |
| H6 | H | No invite/role management: FR-ID-02 / US-1 unmet (only `/users/me`) | OpenAPI route list | identity routes | `POST /users` (owner/admin invite), `PATCH /users/{id}/role`, `GET /users` | RBAC tests |
| H7 | H | URL ingestion missing (FR-ING-01) | no route | ingestion | `POST /documents/url` with SSRF guard (scheme, DNS-resolved IP blocklist incl. 169.254.169.254, redirects re-checked, size/time caps) | SSRF unit tests |
| H8 | H | Conversation summarization exists but is never called (FR-CHAT-02) | `ContextWindowManager` constructed, unused in `stream_answer` | conversation | Call `get_usable_context`, persist the new summary | Unit test |
| H9 | H | KG extraction never runs: worker lacks `graph_extraction_task` | prod worker log "function 'graph_extraction_task' not found"; 0 entities | `ingestion/workers/worker.py` | Register the task | Live ingest → entities > 0 |
| H10 | H | A worker killed mid-`parsing`/`chunking` leaves the document stuck forever (the retry skips non-pending/failed) | `ingest_document_task` status guard | `ingestion/workers/tasks.py` | Allow re-entry on retry (`job_try > 1`) and from the API retry for stale in-progress docs; dedupe jobs with `_job_id` | Unit test |
| H11 | H | Vector search can crash on chunks without embeddings yet (`float(None)`) | `vector_search_repository.py` has no `embedding IS NOT NULL` filter | retrieval | Filter non-null; set `hnsw.ef_search` | Unit test |
| H12 | H | CI is red, so there's no release gate; no Postgres integration job; coverage not enforced in CI (`--no-cov`) | Actions API | `.github/workflows/ci.yml` | Fix steps; add pgvector service job running migrations + live tests; `--cov-fail-under` | Green run |
| H13 | H | Audit log is append-only only by convention | no DB trigger in `9e0f1a2b3c4d` | alembic | Trigger rejecting UPDATE/DELETE on `audit_log` | Live-infra test |
| H14 | H | No database backups at all; 908 MB host running API ×2 workers + worker + Postgres + Redis + nginx; disk 80 % | no cron, no backup dir | host | Nightly `pg_dump` → S3 + retention; `API_WORKERS=1`; prune images | Restore drill |
| H15 | H | Deleting a document leaves it in cached search results for up to 5 min | search cache keyed on `tenant_search_version`, never bumped | retrieval/ingestion | Bump the per-tenant version on index/delete | Unit test |
| H16 | H | No `__init__.py` was ever committed: `Cortex/.gitignore` rule `_*.py` matched them all (103 files), so CI and the prod clone ran a different import tree than local tests | CI ImportError "cannot import name ... (unknown location)" | `.gitignore` | Exempt `__init__.py`, commit them | CI imports |
| H17 | H | Dependencies unpinned: a fresh install resolves SQLAlchemy 2.1 (drops greenlet, so async import fails), Starlette 1.8, FastAPI 0.143, pytest 9 — none tested | CI version annotation | `pyproject.toml`, `docker/Dockerfile` | `constraints.txt` with the tested versions, used by CI and the image build | CI green |
| M1 | M | Upload reads the full body before the size check; raw filename goes into the object key | `CreateDocumentService.execute` | ingestion | Size check first; sanitize the key name | Unit test |
| M2 | M | Enqueue failure leaves a `pending` document that `/retry` refuses | services + reprocess | ingestion | Allow retry of stale pending | Unit test |
| M3 | M | Worker healthcheck curls `:8000` (worker serves no HTTP), so it's permanently "unhealthy" | `docker ps` | compose | Use `arq --check` | `docker ps` healthy |
| M4 | M | Production starts with the dev `SECRET_KEY` default if unset; no prod config validation | `config.py` | config | Fail fast in production on weak secret / `*` hosts | Unit test |
| M5 | M | Status endpoint mislabels S3 as `local` (reads `S3_BUCKET_NAME`, config uses `S3_BUCKET`) | prod `/system/status` | observability routes | Read the setting | Unit test |
| M6 | M | Worker logs at DEBUG (httpcore wire noise) | prod worker log | logging | Quiet third-party loggers | Log check |
| M7 | M | MCP JWT auth trusts the role claim without re-checking the user | `mcp/application/authentication.py` | same | Resolve the user from DB | Test |
| M8 | M | 260 s spent in `test_system_status_endpoint` (real network timeouts) | `--durations` | tests | Stub the probe | Suite < 3 min |

## What works today (verified)

- Tenant registration, login, refresh, JWT validation, role hierarchy (unit + integration tests).
- Upload (JWT) → S3 → arq parse/chunk/embed → `indexed` worked in prod until the embedding model was retired (worker log, 2026-08-14).
- Tenant scoping on chunk queries (`WHERE tenant_id = …` in both retrievers), RRF fusion, idempotent chunk replacement (delete-then-insert).
- Agent loop limits (10 iterations / 60 s / 20 tool calls) and loop detection exist and are unit tested.
- MCP JSON-RPC router, GraphQL schema, KG traversal: unit tested only; not exercised in prod.
