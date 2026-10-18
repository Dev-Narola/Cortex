# Cortex — Deployment Plan

## Current production (observed 2026-10-18)

| Item | State |
|---|---|
| Host | 1 × EC2, eu-north-1, Ubuntu 26.04, 2 vCPU, 908 MB RAM, 3 GB swap, 15 GB disk (80 % used) |
| Public endpoint | `http://13.60.95.116` (nginx :80). **No TLS, no DNS name** |
| Stack | `docker compose -f /opt/cortex/Cortex/docker/docker-compose.prod.yml`: nginx, api (2 uvicorn workers), arq worker, pgvector/pg16, redis 7 |
| Image | `ghcr.io/cortex/cortex:latest`, **built on the host** (not pulled from a registry) |
| Code | `/opt/cortex` git checkout at `a76d4ee` (behind `main`) + 5 uncommitted hotfixes |
| Secrets | `/opt/cortex/Cortex/.env` on disk (Secrets Manager path in `start.sh` not used) |
| Storage | S3 bucket via access keys in `.env` (eu-north-1) |
| Backups | **none** |
| CD | none (manual) |

The PRD/blueprint choice (self-managed EC2 + Postgres, compose) stays. Nothing here justifies RDS/ECS yet.

## Proposed changes

| # | Change | Risk | Needs approval |
|---|---|---|---|
| D1 | Snapshot the host first: `pg_dump` to S3 + copy `.env` to a root-only backup file on the host; `git stash` the server hotfixes (also saved in `Docs/audit/`) | none | yes (writes to prod) |
| D2 | Config: `LLM_PROVIDER=nvidia`, `NVIDIA_MODEL=openai/gpt-oss-20b`, `EMBEDDING_PROVIDER=nvidia`, `NVIDIA_EMBEDDING_MODEL=nvidia/nemotron-3-embed-1b`, `EMBEDDING_DIMENSIONS=2048`, `RERANKER_PROVIDER=llm`, `API_WORKERS=1`, `TRUSTED_HOSTS`/`CORS_ALLOWED_ORIGINS` real values | low | yes |
| D3 | Deploy `fix/production-recovery` (after CI green): `git pull`, `docker compose build`, `up -d api worker` | medium | yes |
| D4 | Migration: embedding column → `halfvec(2048)` (**clears the 109 existing vectors**, already unusable since their model was retired), then re-embed the 3 documents | medium; data is regenerable | **yes (destructive to vectors)** |
| D5 | Nightly backup cron: `pg_dump -Fc` → `s3://<bucket>/backups/` with 14-day retention | low | yes |
| D6 | TLS: certbot + nginx :443, HTTP→HTTPS redirect. Needs a hostname (your domain, or a free `13-60-95-116.sslip.io`) | low | yes + hostname choice |
| D7 | CD: GitHub Actions job that SSHes to the host and runs `scripts/deploy.sh` after CI passes on `main` (needs repo secrets `DEPLOY_HOST`, `DEPLOY_SSH_KEY`) | low | yes + you add secrets |
| D8 | Disk: `docker image prune` / builder cache prune (≈3.5 GB reclaimable) | low | yes |

## First-deploy runbook (exact commands, run on the host as `ubuntu`)

Env files on the host: `Cortex/.env` (container env), `Cortex/docker/.env` (compose
`${...}` interpolation), `/opt/cortex/.env` (unused by compose). Secret values are
never printed; edits use `sed` in place.

```bash
cd /opt/cortex && TS=$(date -u +%Y%m%dT%H%M%SZ) && mkdir -p -m 700 backups
# D1 snapshot: DB dump, env copies, server hotfixes (also in Docs/audit/)
docker exec cortex-postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > backups/pre-deploy-$TS.dump
install -m 600 Cortex/.env backups/env-$TS && install -m 600 Cortex/docker/.env backups/docker-env-$TS
git stash push -m "server-hotfixes-$TS"
# D2 config (Cortex/.env): providers that still exist, 2048-d embeddings, LLM reranker
set_env() { grep -q "^$1=" Cortex/.env && sed -i "s|^$1=.*|$1=$2|" Cortex/.env || echo "$1=$2" >> Cortex/.env; }
set_env LLM_PROVIDER nvidia;            set_env NVIDIA_MODEL openai/gpt-oss-20b
set_env EMBEDDING_PROVIDER nvidia;      set_env NVIDIA_EMBEDDING_MODEL nvidia/nemotron-3-embed-1b
set_env EMBEDDING_DIMENSIONS 2048;      set_env EMBEDDING_BATCH_SIZE 32
set_env RERANKER_PROVIDER llm;          set_env LLM_MAX_TOKENS 2048
set_env SECRET_KEY "$(openssl rand -hex 32)"   # was 24 chars; rotation logs users out once
grep -q '^API_WORKERS=' Cortex/docker/.env && sed -i 's/^API_WORKERS=.*/API_WORKERS=1/' Cortex/docker/.env
# D3 + D4 deploy (migrations run on api boot: w1 clears the dead vectors)
bash Cortex/scripts/deploy.sh <sha-that-passed-CI>
docker exec cortex-worker python scripts/reembed.py     # re-embed the 3 documents
# D5 nightly backup at 02:15 UTC
( crontab -l 2>/dev/null; echo '15 2 * * * bash /opt/cortex/Cortex/scripts/backup.sh >> /opt/cortex/backups/backup.log 2>&1' ) | crontab -
# D8 disk
docker builder prune -f && docker image prune -f
```

Verification after deploy: `/health/ready`; register a smoke tenant; upload a TXT and
a URL → `indexed`; `POST /search` returns the chunk with `rerank_score`; WS chat turn
streams + cites; `GET /tenants/me/usage` > 0; KG entities > 0; API-key + MCP calls;
`docker ps` all healthy; `backup.sh` exit 0 (or 2 = bucket policy blocks `backups/`).

## Rollback

1. Code: `git -C /opt/cortex checkout a76d4ee && git stash pop` (restores the exact pre-change tree), then `docker compose build api worker && docker compose up -d api worker`.
2. Config: restore `.env` from the backup taken in D1.
3. Schema (D4): `alembic downgrade -1` recreates `vector(1024)` (vectors stay empty); with the old embedding model retired there's nothing to restore, so re-embed with the active model.
4. Database: `pg_restore --clean -d cortex <dump>` from the D1 dump.

## Health checks after each step

`/health` 200 · `/health/ready` db+redis ok · upload a TXT → `indexed` · `POST /search` returns that chunk ·
WS chat turn streams tokens + citations · `GET /tenants/me/usage` shows events · `docker ps` all healthy.

## Ongoing cost (estimate)

EC2 t3.micro-class ≈ $8–10/mo · EBS 15 GB ≈ $1.5/mo · S3 (docs + nightly dumps, < 1 GB) < $0.10/mo ·
NVIDIA API free tier ($0, rate-limited; models get retired, as happened twice) · OpenAI $0 unless credits are added.
908 MB RAM is the binding constraint; upgrading to 2 GB (t3.small ≈ $17/mo) is the first scaling step.
