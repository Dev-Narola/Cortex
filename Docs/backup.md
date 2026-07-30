# Cortex — Backup and Restore

The V5 deployment runs the database as a container on a
single EC2 host. The instance is **disposable** — every
component that matters is either in S3 (document blobs)
or in AWS Secrets Manager (credentials) or pushed to GHCR
as a new image tag (code). The one piece of state that
does *not* survive the loss of the host is the postgres
data volume. This document covers the procedure for not
losing it.

> **The two-second version**: nightly `pg_dump` to a
> private S3 bucket, weekly test-restore onto a scratch
> EC2. Do both. The first keeps you alive; the second
> makes sure the first is actually a backup, not a hope.

---

## 1. What needs backing up

| Resource | Where it lives | Backup method | Recovery SLA |
|---|---|---|---|
| Postgres data | Docker named volume `cortex_postgres_data` on the EC2 host | `pg_dump` to a private S3 bucket, nightly | ≤ 24h data loss |
| Document blobs | S3 bucket `cortex-documents-prod` | S3 versioning (already enabled) + cross-region replication (optional) | ≤ 0 (recoverable to any point in last 30 days) |
| Secrets | AWS Secrets Manager | Secrets Manager is itself replicated within the region | ≤ 0 |
| Application code | GHCR (`ghcr.io/<org>/cortex`) | Git history is the source of truth; the registry stores the build artefacts | ≤ 0 |
| Audit log | Postgres `audit_log` table | Same as postgres data | ≤ 24h data loss |
| Redis | Docker named volume `cortex_redis_data` | **Not backed up.** Redis is a cache; losing it is recoverable (the next request rebuilds the key). | n/a |
| Worker job state (Arq results) | Redis | Same as above | n/a |

The audit log and the postgres data are backed up by the
same dump. Redis is deliberately not.

---

## 2. The backup script

The script lives at `scripts/backup.sh` and is run from
the EC2 host. It is intentionally small so the operation
is auditable at a glance.

```bash
#!/usr/bin/env bash
# /opt/cortex/scripts/backup.sh
# Run nightly from the EC2 user's crontab. Captures a
# consistent pg_dump of the running database and writes it
# to a private S3 bucket. The bucket is *not* the same as
# the document bucket; backups are isolated so a misapplied
# lifecycle policy on one cannot affect the other.

set -Eeuo pipefail

: "${PG_CONTAINER:=cortex-postgres}"
: "${PG_USER:=cortex}"
: "${PG_DB:=cortex}"
: "${BACKUP_BUCKET:=cortex-backups-prod}"
: "${BACKUP_PREFIX:=postgres}"
: "${RETENTION_DAYS:=30}"
: "${AWS_REGION:=us-east-1}"

TS=$(date -u +%Y%m%dT%H%M%SZ)
DUMP_PATH="/tmp/cortex-${TS}.dump"

# 1. ``pg_dump`` inside the running container. ``-Fc`` is
#    the custom compressed format: smaller than SQL text
#    and supports parallel restore with ``pg_restore -j``.
docker exec "${PG_CONTAINER}" \
    pg_dump -U "${PG_USER}" -d "${PG_DB}" -Fc \
            --no-owner --no-privileges \
    > "${DUMP_PATH}"

# 2. Compress further (the custom format is already
#    compressed; gzip is a marginal win for the network,
#    significant for the cost).
gzip "${DUMP_PATH}"

# 3. Upload to S3 with a date-stamped key. The S3 bucket
#    has a lifecycle policy that expires objects older
#    than ``RETENTION_DAYS``.
aws s3 cp "${DUMP_PATH}.gz" \
    "s3://${BACKUP_BUCKET}/${BACKUP_PREFIX}/${TS}.dump.gz" \
    --region "${AWS_REGION}" \
    --only-show-errors

# 4. Local cleanup.
rm -f "${DUMP_PATH}.gz"

# 5. Prune the local log. The bucket-side lifecycle handles
#    the actual retention.
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] backup ok: s3://${BACKUP_BUCKET}/${BACKUP_PREFIX}/${TS}.dump.gz"
```

A few choices worth flagging:

* **`--no-owner --no-privileges`** — the restore target
  may use a different role name; these flags make the
  dump portable.
* **`-Fc` (custom format)** — smaller than SQL text and
  supports parallel restore. The trade-off is that you
  cannot grep the dump directly; you need `pg_restore`
  to read it.
* **S3 over `pg_basebackup`** — `pg_basebackup` is
  point-in-time-correct, but for a single-host demo the
  nightly `pg_dump` is simpler and the recovery
  characteristics are well-understood. Migrate to
  `pg_basebackup` + WAL archiving only when the SLA
  tightens.

### 2.1 The cron line

Add to the host's crontab (`crontab -e`):

```cron
# Nightly backup at 02:30 UTC. Adjust the path to match
# the install location.
30 2 * * * /opt/cortex/scripts/backup.sh >> /var/log/cortex-backup.log 2>&1
```

The `>>` appends to a log file that the operator can
tail to confirm the backup ran.

---

## 3. The backup bucket

The bucket is separate from `cortex-documents-prod`. The
rationale: a misapplied lifecycle policy on the document
bucket (e.g. "expire everything older than 30 days")
cannot accidentally nuke the backups.

```bash
aws s3api create-bucket \
    --bucket cortex-backups-prod \
    --region us-east-1 \
    --object-ownership BucketOwnerEnforced

# Block all public access.
aws s3api put-public-access-block \
    --bucket cortex-backups-prod \
    --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# Default encryption.
aws s3api put-bucket-encryption \
    --bucket cortex-backups-prod \
    --server-side-encryption-configuration \
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

# Lifecycle: expire the daily dumps after 30 days. Weekly
# snapshots (kept longer) are placed under a different
# prefix and have their own rule.
cat > /tmp/backups-lifecycle.json <<'EOF'
{
  "Rules": [
    {
      "ID": "expire-daily",
      "Filter": { "Prefix": "postgres/" },
      "Status": "Enabled",
      "Expiration": { "Days": 30 }
    },
    {
      "ID": "expire-weekly",
      "Filter": { "Prefix": "postgres-weekly/" },
      "Status": "Enabled",
      "Expiration": { "Days": 90 }
    }
  ]
}
EOF
aws s3api put-bucket-lifecycle-configuration \
    --bucket cortex-backups-prod \
    --lifecycle-configuration file:///tmp/backups-lifecycle.json
```

The bucket policy: deny everything except the EC2
instance role (so the host can write) and a small
"backup operator" IAM user (so a human can read for
restores). The pattern is the same as in
`aws-setup.md` §3 — omit it here for brevity.

### 3.1 Weekly snapshot

The nightly backup is a 30-day rolling window. A weekly
snapshot kept for 90 days is the right complement: it
survives a longer-running corruption that nobody noticed
for a month.

```cron
# Weekly backup on Sunday at 03:00 UTC. Same script, but
# the dump goes under the ``postgres-weekly/`` prefix
# which has the longer retention policy.
0 3 * * 0 BACKUP_PREFIX=postgres-weekly /opt/cortex/scripts/backup.sh >> /var/log/cortex-backup.log 2>&1
```

The script already honours `$BACKUP_PREFIX`, so the only
change is the env var in front of the command.

---

## 4. Restoring

Two restore scenarios, in increasing order of severity.

### 4.1 Restore into the *running* database (recover from a bad migration)

This is the most common restore: a migration ran, an
operator realised it was wrong, and the database needs
to be put back to a known-good state.

```bash
# 1. Find the most recent good backup.
aws s3 ls s3://cortex-backups-prod/postgres/ | tail -5

# 2. Stop the api and worker so no traffic hits the
#    database mid-restore.
cd /opt/cortex
docker compose -f Docker/docker-compose.prod.yml stop api worker

# 3. Download the dump.
aws s3 cp s3://cortex-backups-prod/postgres/20260728T023000Z.dump.gz /tmp/

# 4. Drop and recreate the database. The volume keeps
#    the cluster itself; the database is just one item
#    in it.
docker exec cortex-postgres \
    psql -U cortex -d postgres -c "DROP DATABASE cortex;"
docker exec cortex-postgres \
    psql -U cortex -d postgres -c "CREATE DATABASE cortex OWNER cortex;"

# 5. Restore. ``-j 4`` parallelises the restore across
#    four workers; bump on larger instances.
gunzip -c /tmp/20260728T023000Z.dump.gz > /tmp/restore.dump
docker exec -i cortex-postgres \
    pg_restore -U cortex -d cortex -j 4 < /tmp/restore.dump

# 6. Bring the api and worker back up.
docker compose -f Docker/docker-compose.prod.yml up -d api worker
```

The `DROP DATABASE` line is the part operators hesitate
over. The "soft" alternative is to restore into a
separate database and swap the connection string — but
that requires application downtime longer than the swap
itself, and the dump is small enough that the
drop-and-recreate path is faster.

### 4.2 Restore onto a *new* host (disaster recovery)

This is the "the EC2 is gone and so is its volume"
scenario. The procedure is:

1. Launch a new EC2 (per `aws-setup.md` §6).
2. Bring the new host up to "the application stack is
   running but the database is empty".
3. **Before** allowing any traffic, restore the latest
   dump into the new postgres container:
   ```bash
   aws s3 cp s3://cortex-backups-prod/postgres/<TS>.dump.gz /tmp/
   gunzip -c /tmp/<TS>.dump.gz | \
       docker exec -i cortex-postgres \
           pg_restore -U cortex -d cortex -j 4
   ```
4. Verify: the `documents`, `users`, `audit_log` tables
   are populated; the most recent `usage_event` row is
   from before the disaster; a quick search query
   returns a known chunk.
5. Update Route 53 / ALB target group to point at the
   new host.

The "verify" step is the bit that most operators skip.
Skipping it is how a "backup" turns out to be a corrupt
file. A weekly test-restore onto a scratch EC2 (next
section) is the discipline that catches it.

---

## 5. Test restores (the part nobody does until they need it)

A backup that has never been restored is a hypothesis.
Test restores are how the hypothesis becomes a fact.

The cheapest way to schedule them: a small Lambda
function on a weekly cron that:

1. Launches a `t3.micro` EC2 with the same user-data as
   production.
2. SSHes in, runs the same restore steps from §4.2.
3. Runs a SQL assertion: `SELECT count(*) FROM tenants;`
   matches a known-good value.
4. Terminates the instance.

The Lambda is out of scope for V5 — the manual procedure
is what the operator runs the first time, and a
quarterly drill cadence (once a quarter, manually
restore onto a scratch host, check the data is sane) is
the right level of rigour for a single-tenant demo.

---

## 6. Restoring from S3 (lost document blobs)

Document blobs live in `cortex-documents-prod`. Two
recovery paths:

* **Accidental overwrite or delete of a single object.**
  S3 versioning (enabled in `aws-setup.md` §3) keeps
  every previous version. Restore with:
  ```bash
  aws s3api list-object-versions \
      --bucket cortex-documents-prod \
      --prefix tenants/<tenant_id>/documents/<doc_id>/
  aws s3api copy-object \
      --bucket cortex-documents-prod \
      --copy-source cortex-documents-prod/tenants/<tenant_id>/documents/<doc_id>/original/file.pdf?versionId=<id> \
      --key tenants/<tenant_id>/documents/<doc_id>/original/file.pdf
  ```
* **Bucket-wide loss.** Cross-region replication (CRR)
  is the right defence. Set it up with:
  ```bash
  aws s3api put-bucket-replication \
      --bucket cortex-documents-prod \
      --replication-configuration '{
          "Role": "arn:aws:iam::111122223333:role/cortex-replication",
          "Rules": [{
              "ID": "replicate-everything",
              "Status": "Enabled",
              "Filter": { "Prefix": "" },
              "Destination": {
                  "Bucket": "arn:aws:s3:::cortex-documents-prod-replica",
                  "StorageClass": "STANDARD_IA"
              }
          }]
      }'
  ```
  CRR is a V9 hardening item — the per-bucket replication
  cost is real, and the V5 demo's RPO (≤ 24h, the
  postgres backup cadence) does not require it.

---

## 7. What V5 does not back up

Calling these out so the operator does not assume they
are covered:

* **Redis state.** Cache entries and Arq job results
  are not persisted across host loss. The Arq job
  results that matter (the ingestion job outcome) are
  also written to the postgres `documents` row's
  `status` field — that *is* in the pg_dump.
* **OpenTelemetry trace data.** Traces are exported
  out-of-process (operator-provided OTLP collector) and
  live in the collector's storage, not on the host.
  Back up the collector separately.
* **Logs.** Application logs go to stdout in JSON, which
  `docker compose logs` tails. They are not persisted
  on the host. A CloudWatch agent or similar is the
  right answer for long-term log retention.
* **Secrets Manager secret *history*.** Secrets Manager
  does keep prior versions of each secret. The IAM
  policy in `aws-setup.md` §2.3 allows `GetSecretValue`
  which returns the current version by default; a
  `RestoreSecret` is needed for older versions.
