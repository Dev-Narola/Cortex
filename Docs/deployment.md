# Cortex — Production Deployment Guide

This document walks through taking Cortex from "the docker compose
stack works on my laptop" to "the same stack runs on a single EC2
host, fronted by an ALB, with secrets in AWS Secrets Manager and
files in S3". It assumes the AWS resources described in
[`aws-setup.md`](aws-setup.md) already exist.

The deployment model — one EC2 host, docker compose, the platform
runs entirely from one image — is the deliberate V5 trade-off
called out in `cortex-engineering-blueprint.md`: start on plain
EC2 with self-managed Postgres, only migrate to RDS / ECS when an
operational pain names itself. The CD pipeline is the only thing
that touches the host on a deploy; everything else is automated.

---

## 1. Topology at a glance

```
                        ┌──────────────────────────┐
                        │      Route 53 (DNS)      │
                        │   api.cortex.example.com │
                        └──────────────┬───────────┘
                                       │  A record
                                       ▼
                        ┌──────────────────────────┐
                        │   ALB (TLS termination)  │
                        │   Target group:          │
                        │     cortex-api:8000      │
                        └──────────────┬───────────┘
                                       │  HTTP
                                       ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ EC2 (single host)                                           │
   │                                                             │
   │   ┌──────────┐    ┌──────────────────────────────────┐      │
   │   │  nginx   │───►│ docker compose: cortex-prod      │      │
   │   │  :80/443 │    │  - api (uvicorn)                 │      │
   │   └────┬─────┘    │  - worker (arq)                  │      │
   │        │          │  - postgres (pgvector)           │      │
   │   :8000│          │  - redis                         │      │
   │        ▼          └──────────────────────────────────┘      │
   │   ┌──────────┐                                                │
   │   │   api    │────► Secrets Manager (instance role)          │
   │   └──────────┘                                                │
   │                                                             │
   │   Host volumes:                                             │
   │     /var/lib/docker/volumes/cortex_postgres_data             │
   │     /var/lib/docker/volumes/cortex_redis_data               │
   │     /opt/cortex/.env.runtime                                │
   │     /opt/cortex/.last-good-tag                              │
   └─────────────────────────────────────────────────────────────┘
                  │
                  │  egress
                  ▼
   ┌──────────────────────────────────┐
   │   S3 (cortex-documents-...)      │
   │   Secrets Manager (cortex/*)     │
   └──────────────────────────────────┘
```

Two things to notice:

* **Only nginx exposes ports 80/443.** The api container
  publishes 8000 to the host loopback *only* for emergency
  debugging (`127.0.0.1:8000:8000` in the compose file). The
  postgres and redis containers have no port mapping.
* **Secrets never appear on disk in a way that survives a
  container restart.** The api and worker render them to a
  tmpfs (`/run/secrets/.env`) on every boot.

---

## 2. First-time host bootstrap

The very first time you set up the EC2 host, run the bootstrap
block once. After that, every subsequent change is a deploy.

```bash
# 1. SSH in
ssh -i ~/.ssh/cortex-prod.pem ec2-user@<elastic-ip>

# 2. Install Docker + the AWS CLI. The official Docker
#    install script is fine for a single-host demo. Pin
#    to a recent LTS Compose version.
sudo yum update -y
sudo yum install -y docker
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user
newgrp docker

# Install Docker Compose v2 (the ``docker compose`` plugin).
DOCKER_CONFIG=${DOCKER_CONFIG:-$HOME/.docker}
mkdir -p $DOCKER_CONFIG/cli-plugins
curl -fsSL https://github.com/docker/compose/releases/download/v2.27.0/docker-compose-linux-x86_64 \
     -o $DOCKER_CONFIG/cli-plugins/docker-compose
chmod +x $DOCKER_CONFIG/cli-plugins/docker-compose
docker compose version

# Install the AWS CLI v2 (required for ``secretsmanager`` calls
# in start.sh and deploy.sh).
curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
sudo yum install -y unzip
sudo unzip -q /tmp/awscliv2.zip -d /tmp/
sudo /tmp/aws/install

# 3. Create the project directory and pull the code.
sudo mkdir -p /opt/cortex
sudo chown ec2-user:ec2-user /opt/cortex
cd /opt/cortex
git clone https://github.com/<your-org>/cortex.git .

# 4. Log in to GHCR so the host can pull the image. A
#    deploy-only PAT with ``read:packages`` is the right
#    scope. The PAT is stored in ``~/.docker/config.json``.
echo "$GHCR_PAT" | docker login ghcr.io -u <your-org> --password-stdin

# 5. Verify secrets are reachable via the instance role.
aws secretsmanager get-secret-value --secret-id SECRET_KEY \
  --query SecretString --output text
# If this fails, the IAM role on the EC2 is not attached (or
# the inline policy is wrong). Re-check docs/aws-setup.md.

# 6. Pull the image and bring up the stack for the first
#    time. The first run creates the postgres volume and
#    applies migrations.
CORTEX_IMAGE=ghcr.io/<your-org>/cortex \
CORTEX_IMAGE_TAG=sha-$(git rev-parse --short HEAD) \
docker compose -f Docker/docker-compose.prod.yml --env-file /dev/null up -d
```

The first boot takes longer than usual because postgres has to
initialise the data directory. Watch the logs:

```bash
docker compose -f Docker/docker-compose.prod.yml logs -f api
```

When the api container logs `Application startup complete.`,
the stack is up. Hit the local health endpoint to confirm:

```bash
curl http://127.0.0.1:8000/health
# {"status":"ok"}
```

---

## 3. Routine deploys

Once the host is bootstrapped, deploys are a single command from
the CD pipeline:

```bash
# On the EC2 host, run from /opt/cortex
./scripts/deploy.sh --image-tag sha-abcdef1
```

The script:

1. Pulls the requested image from GHCR.
2. Renders the host-side `.env.runtime` from Secrets Manager so
   the postgres container has the right credentials.
3. Restarts the api and worker (the `--no-deps` flag prevents
   the database and redis containers from being recreated).
4. Polls the api container's `Health:` field for up to 120
   seconds.
5. Records the deployed tag in `.last-good-tag` *after* the
   health check passes, so a half-deployed tag is never
   considered "last known good".
6. On health-check failure, rolls back to the previous tag and
   exits with a non-zero status.

The CD pipeline invokes the same script via SSH from GitHub
Actions. The two are equivalent; the operator can run the script
by hand for a hotfix and the next CD run will pick up the
new "last known good" tag from the file.

---

## 4. Bringing the stack down

There are three gradations:

```bash
# Stop the api and worker only. Postgres and redis stay up
# so the next deploy is fast. Use this for a temporary
# maintenance window.
docker compose -f Docker/docker-compose.prod.yml stop api worker

# Stop the entire stack. The named volumes (postgres_data,
# redis_data) are preserved.
docker compose -f Docker/docker-compose.prod.yml down

# Stop the stack AND delete the volumes. This is destructive
# — every document chunk, every user, every API key is gone.
# Only do this for a true reset.
docker compose -f Docker/docker-compose.prod.yml down -v
```

The `down -v` path is documented because it is occasionally the
right thing during early development. **It is not a backup
strategy** — see [`backup.md`](backup.md) for that.

---

## 5. What to monitor

The blueprint's observability bar (V4) carries forward. The
production stack exposes the same endpoints nginx + ALB already
need to probe:

| Endpoint | Purpose | Where it lives |
|---|---|---|
| `GET /health` | Liveness — process is up | FastAPI on api:8000, proxied through nginx |
| `GET /health/ready` | Readiness — Postgres + Redis reachable | Same |
| `GET /metrics` | Prometheus exposition | Same, restricted to private CIDRs in nginx |

A minimal but useful CloudWatch / Prometheus alert set:

* `http_requests_total{status=~"5.."}` > 1% for 5 min → page
* `process_cpu_seconds_total` > 80% of the limit for 10 min → warn
* `/health/ready` failing on 2 of 3 probes → page (database down)
* Disk usage on the EC2 > 80% → warn (volume mount growing)
* S3 `4xx` rate on `PutObject` > 1% for 5 min → warn (IAM / bucket policy)

A separate set of alerts on the host itself:

* Disk usage on the root volume (Docker overlay, logs, etc.)
* Memory pressure (the 1GB-capped postgres container can OOM
  under load — check `docker stats` and `dmesg | grep -i oom`)
* `docker compose ps` showing any container in `Restarting`
  state for more than 2 minutes

---

## 6. Troubleshooting quick reference

| Symptom | Likely cause | Where to look |
|---|---|---|
| Container keeps restarting | `start.sh` exits before exec — missing secret, bad migration | `docker compose logs api` — the first 20 lines are the entrypoint trace |
| `502 Bad Gateway` from nginx | api container not healthy | `docker compose ps` — check the `Health` column for the api |
| `503 Service Unavailable` on `/health/ready` | Postgres or Redis unreachable | `docker compose logs postgres` and `docker compose logs redis` |
| Successful deploy, but old code is serving | nginx cache, or `latest` tag stuck | Pull by SHA tag, not `latest`. Confirm `CORTEX_IMAGE_TAG` was set in the deploy. |
| LLM call returns 401 | `OPENAI_API_KEY` not present in Secrets Manager | `aws secretsmanager get-secret-value --secret-id OPENAI_API_KEY` on the host |
| S3 upload fails with 403 | EC2 instance role missing `s3:PutObject` for the bucket | Re-check `aws-setup.md` Step 3 |
| Migrations appear to "skip" | `RUN_DB_MIGRATIONS_ON_START=false` was set, or the alembic version table is already at head | `docker compose exec postgres psql -U cortex -d cortex -c "SELECT * FROM alembic_version;"` |

The full troubleshooting guide is in the runbook embedded in
`docs/backup.md` and `docs/ci-cd.md` — the two paths where
"what do I do when X goes wrong" is the most asked question.

---

## 7. What V5 deliberately did not deliver

These are the items the blueprint defers to V6+ (agentic
layer) or V9+ (hardening). Calling them out so a future
operator does not go looking:

* No auto-scaling — single host, fixed capacity
* No multi-region / multi-AZ — single EC2, single point of failure
* No database read replicas — Postgres is single-instance
* No APM / distributed tracing visualisation backend — OTel
  is wired but the collector is operator-provided
* No secret *rotation automation* — secrets are fetched on
  boot, so a rotation is a container restart. Automatic
  restart on a rotation event is a V9+ item.
* No blue/green or canary — deploy.sh does a rolling restart
  with a 120-second health window. A blue/green deploy would
  require a second EC2 host or ECS.
