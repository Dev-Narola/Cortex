# Deployment

V9 Part 4, Task 47.

## Container

The reference image is built from the project `Dockerfile`:

```bash
docker build -t cortex:1.0.0 .
```

The image:

* Extends `python:3.12-slim`
* Installs the `cortex` package
* Runs `alembic upgrade head` on start (toggle via
  `RUN_DB_MIGRATIONS_ON_START`)
* Exposes port 8000
* Drops root, runs as `cortex` user

## docker-compose

The `docker-compose.yml` at the repo root brings up:

* `postgres` — primary database
* `redis` — cache + queue
* `api` — FastAPI service
* `worker` — Arq worker
* `nginx` — reverse proxy

## AWS

The production deployment uses:

* ECS Fargate for the API and worker
* RDS Postgres (Multi-AZ) for the database
* ElastiCache Redis for the cache + queue
* S3 for object storage
* ALB in front of the API
* Secrets Manager for credentials
* CloudWatch for logs + metrics

See `scripts/deploy.sh` for the deploy script.

## Environment

Production environment variables are documented in
`Docs/configuration.md`. The critical ones are:

* `DATABASE_URL` — Postgres connection string
* `REDIS_URL` — Redis connection string
* `SECRET_KEY` — JWT signing key (from Secrets Manager)
* `OPENAI_API_KEY` — LLM provider key (from Secrets Manager)
* `ENVIRONMENT=production`

## Scaling

The API is horizontally scaled via the Fargate service
auto-scaling. See `Docs/scaling/horizontal-scaling.md`.

## Rollback

To roll back to the previous release:

```bash
./scripts/rollback.sh v0.9.0
```

The script:

1. Tags the current image as `cortex:previous`
2. Deploys the requested tag
3. Runs the post-deploy validation
4. Reports the result

## Health checks

* `GET /health/live` — liveness
* `GET /health/ready` — readiness (detailed component status)
* `GET /health` — composite

See `src/platform/health.py` and the runbooks in
`Docs/runbooks/`.
