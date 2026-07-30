# Cortex — CI / CD

The CI pipeline (`.github/workflows/ci.yml`) and the CD
pipeline (`.github/workflows/cd.yml`) are deliberately
split. CI proves the code is correct; CD proves the deploy
is correct. A broken CI never produces an image, so a
broken deploy cannot be blamed on the code; conversely,
a broken deploy can be re-tried without rebuilding the
image.

---

## 1. CI

`ci.yml` runs on every push and pull request to `main`
and `release/*`. Three jobs:

1. **lint-and-format** — `ruff check` and `black --check`
   on the same code that the tests run against. Fails the
   build on any deviation, with a PR diff annotation so the
   contributor can run `black .` and re-push.
2. **test** — `pytest` with the coverage bar enforced by
   `fail_under` in `pyproject.toml` (the V4 baseline of
   67%). The unit suite uses SQLite + `db_mock` /
   `redis_mock` fixtures, so no live infrastructure is
   required for CI to run.
3. **docker-image** — only on `push` (not pull requests).
   Builds the multi-stage image and pushes it to GHCR
   tagged with the commit SHA. The `:latest` tag is
   updated only on `main` so a feature branch never
   silently overwrites the production default.

### 1.1 The image tag scheme

`docker/metadata-action` derives tags from the event:

| Event | Tags pushed |
|---|---|
| PR from `feature/foo` | none (build is skipped) |
| Push to `feature/foo` | `sha-<short>`, `feature-foo` |
| Push to `main` | `sha-<short>`, `main`, `latest` |
| Push to `release/1.0` | `sha-<short>`, `release-1.0` |

The `:sha-<short>` tag is what the CD pipeline consumes.
The `<branch>` tag is for debugging; the CD never deploys
on a branch other than `main` or `release/*`.

### 1.2 Why GHCR and not ECR

The project uses GitHub Container Registry rather than
Amazon ECR for two reasons:

* **No extra auth flow in CI.** GHCR authenticates with
  the built-in `GITHUB_TOKEN`; ECR requires an
  `aws-actions/configure-aws-credentials@v4` step that
  assumes an OIDC trust between the repo and an AWS role.
  OIDC is the right answer at scale, but for a
  single-tenant demo the GHCR login is two lines.
* **Free for public images.** The repo's license is
  portfolio-friendly; public GHCR images are the cheapest
  path to "the image is downloadable by anyone who clones
  the repo". ECR is free too, but pulls are
  cross-account-billed.

The cost of this choice is the dependency on a GitHub
service for the registry. If the project ever moves to a
self-hosted git provider, switching to ECR is a CI-only
change — the production `Docker/docker-compose.prod.yml` reads
the image name from an env var.

### 1.3 Concurrency

```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

A force-push cancels the in-flight run for the same ref.
Without this, a force-push would queue a new build that
overwrites the previous one's cache without ever
finishing, wasting runner minutes.

---

## 2. CD

`cd.yml` runs on every push to `main` and `release/*`,
plus a manual `workflow_dispatch` trigger for hot-fixes.

The flow:

1. Validate the three required secrets are present
   (`EC2_SSH_KEY`, `EC2_HOST`, `EC2_USER`).
2. Determine the image tag (the commit SHA, or the value
   passed to `workflow_dispatch`).
3. SSH into the EC2 host as the deploy user.
4. Run `scripts/deploy.sh --image-tag <tag>` on the host.
5. Smoke test the public URL (if `PUBLIC_HOSTNAME` is
   set).
6. Notify on failure (the example webhook is commented
   out; uncomment and add the secret for your channel).

### 2.1 Required repository secrets

| Secret | What it is | Where to get it |
|---|---|---|
| `EC2_SSH_KEY` | The private SSH key for the deploy user | `ssh-keygen -t ed25519 -f cortex-deploy`; the `.pub` half is added to `~/.ssh/authorized_keys` on the host in `aws-setup.md` §6 |
| `EC2_HOST` | The Elastic IP or DNS name of the host | The `EIP_ALLOC` from `aws-setup.md` §6 |
| `EC2_USER` | The SSH user (usually `ec2-user`) | From the host's `/etc/passwd` |
| `PUBLIC_HOSTNAME` | The public URL the smoke test hits | `https://api.cortex.example.com` (optional) |
| `SLACK_WEBHOOK_URL` | (Optional) Failure notification channel | Your Slack workspace's incoming-webhook URL |

Secrets are managed at the repository or environment level
in the GitHub UI (`Settings → Secrets and variables →
Actions`). For a production deploy, prefer the
*environment*-scoped secrets so the `production`
environment's protection rules gate the deploy.

### 2.2 The deploy script is the source of truth

The CD pipeline's only job is to invoke
`scripts/deploy.sh` on the host. The script does
everything else:

* Renders the host-side `.env.runtime` from Secrets
  Manager.
* Pulls the image.
* Restarts the api + worker.
* Waits for the health check.
* Records the last-known-good tag.
* Rolls back on failure.

Invoking the same script by hand (or from a different
automation tool) produces an identical deploy. This is
deliberate: the CD pipeline is a thin wrapper, not a
sibling to the deploy script.

### 2.3 What "rollback" means here

`deploy.sh` records the previously-deployed image tag in
`/opt/cortex/.last-good-tag` *only after* a successful
health check. On a failed health check, the script
re-deploys the previous tag and exits 1. The previous
deploy's containers are replaced; there is no in-place
"revert" because docker compose has no first-class
blue/green primitive without a second host.

A more sophisticated rollback (blue/green, canary) is a
V9 hardening item. The V5 baseline — "redeploy the last
known good tag" — covers the most common failure modes:

* Bad migration
* Bad config change
* A new dependency that breaks the runtime

It does **not** cover a corrupted state in the database
itself. For that, see [`backup.md`](backup.md).

### 2.4 Required environment: `production`

```yaml
environment:
  name: production
  url: ${{ steps.deploy.outputs.public_url }}
```

The `production` environment can hold additional
protection rules in the GitHub UI:

* **Required reviewers** — a human must approve the
  deploy before it runs.
* **Wait timer** — a mandatory delay between PR merge
  and deploy (e.g. 5 minutes), useful when a mistake has
  time to surface in monitoring before the next change
  lands.
* **Deployment branches** — restrict to `main` /
  `release/*` only.

For a portfolio demo these rules are optional. For a
real production system they are the cheapest safety
net you can add.

---

## 3. Local pre-flight checks

Before pushing a change, the local equivalents of the CI
checks run in seconds:

```bash
# Lint
ruff check src tests

# Format
black --check --diff src tests

# Tests
pytest -v

# Image build (matches what CI does)
docker build -t cortex:local-test .

# Image smoke test (matches what CD does after deploy)
docker compose -f Docker/docker-compose.prod.yml up -d
curl http://localhost/health
docker compose -f Docker/docker-compose.prod.yml down -v
```

The `docker compose down -v` at the end is the standard
"reset the world" — it removes the postgres and redis
volumes so the next run starts from a clean state.

---

## 4. Common CI failure modes

| Symptom | Most common cause | Fix |
|---|---|---|
| `ruff check` fails on a PR | Lint drift from `main` | `ruff check --fix src tests` then commit |
| `black --check` fails | Format drift | `black src tests` then commit |
| `pytest` fails on a missing dependency | New import not in `pyproject.toml` | Add the dep, re-run |
| Coverage below 67% | New code not tested | Add tests, or lower the bar (last resort — see ADR-0025) |
| `docker build` fails on a missing `COPY` | Source file not in the build context | Check `.dockerignore`; remove the exclusion |
| `docker build` fails on a missing `pip` dep | New dep not in `pyproject.toml` | Add the dep; the builder stage rebuilds on `pyproject.toml` change |
| `docker login` fails on GHCR | Repo doesn't have `packages:write` permission | Add `permissions: packages: write` to the workflow (already set in `ci.yml`) |
| `docker build-push-action` times out | Network blip on a large layer | Re-run; the GHA cache should make subsequent builds fast |

---

## 5. Common CD failure modes

| Symptom | Most common cause | Fix |
|---|---|---|
| `EC2_SSH_KEY` not set | Secret not configured | Add the secret in the GitHub UI |
| `ssh: connect to host ... port 22: Connection refused` | EC2 security group / host down | Check the host is running; check the SG allows SSH from the runner's IP range (GitHub-hosted runners use a known set of ranges — https://api.github.com/meta) |
| `Permission denied (publickey)` | The `.pub` half of the deploy key is not on the host | `aws ec2 describe-instances ...` and `ssh ec2-user@<host> 'cat ~/.ssh/authorized_keys'` |
| `deploy.sh: command not found` | The script is not on the host | `scp scripts/deploy.sh ec2-user@<host>:/opt/cortex/scripts/` and `chmod +x` |
| `deploy.sh` fails on a missing secret | The instance role does not have `secretsmanager:GetSecretValue` on the secret ARN | Re-check `aws-setup.md` §2.3 |
| `docker compose up` fails on a missing image | Wrong `CORTEX_IMAGE` env var | Check the image name in `Docker/docker-compose.prod.yml` matches what CI pushed |
| Health check times out | App crashes on boot; bad migration | `docker compose -f Docker/docker-compose.prod.yml logs api` — the entrypoint trace is the first 20 lines |
| Rollback fails (exit 2) | Previous tag is broken too | `docker compose -f Docker/docker-compose.prod.yml logs api` to diagnose; manual recovery per `deployment.md` §2 |
| Smoke test never succeeds | The ALB is not yet routing to the new host | The probe loop waits 60s; if the ALB target group is in a cold-start state, bump `HEALTH_TIMEOUT_SECONDS` in `deploy.sh` or wait for the next deploy |

---

## 6. Adding a new secret

The pipeline is intentionally narrow about which secrets
it touches — `deploy.sh` and `start.sh` only read the
secrets the application genuinely needs. Adding a new
secret is a five-step change:

1. **Add the value to AWS Secrets Manager**
   ```bash
   aws secretsmanager create-secret \
       --name cortex/prod/NEW_SECRET \
       --secret-string "the value"
   ```

2. **Add the ARN to the IAM policy** in
   `aws-setup.md` §2.3, and re-apply it with
   `aws iam put-role-policy`.

3. **Add the env-var name to `REQUIRED_SECRETS`** (or
   the optional loop) in `scripts/start.sh`.

4. **Add the field to `Settings`** in
   `src/core/config.py` so the application reads it via
   the typed config surface.

5. **Push the change.** The CI builds the new image with
   the updated `start.sh`; the next CD run pulls it,
   the entrypoint fetches the new secret, and the
   application sees the new field on its next config
   load.

No `cd.yml` change is required — the pipeline picks up
the new image automatically.
