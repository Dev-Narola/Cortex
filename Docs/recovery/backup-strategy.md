# Backup Strategy

V9 Part 3, Task 34.

This document describes how Cortex backs up every
stateful component. The strategy is built on three
principles:

1. **Backups are continuous or near-continuous** for
   mission-critical state (Postgres primary, Redis,
   object storage). At most 5 minutes of data loss is
   acceptable.
2. **Backups are immutable** — once written, they
   cannot be tampered with. A retention lock prevents
   the operator from deleting recent snapshots.
3. **Backups are verified** — the recovery validation
   script restores the most recent backup into a
   sandboxed environment and asserts the application
   can boot.

## Postgres

| Property | Value |
| --- | --- |
| Method | `pg_basebackup` (daily full) + WAL archiving (continuous) |
| Frequency | Full: 02:00 UTC; WAL: continuous |
| Retention | 7 days of full backups; 30 days of WAL |
| Storage | S3 (versioned + Object Lock) |
| Encryption | AES-256 (S3-SSE) + customer-managed key |
| Verification | Daily `pg_restore` to the staging cluster |
| RPO | 5 min (WAL ship) |
| RTO | 30 min (full restore + replay) |

## Redis

| Property | Value |
| --- | --- |
| Method | RDB snapshot every 5 min + AOF rewrite every 1 h |
| Frequency | Continuous |
| Retention | 7 days |
| Storage | S3 (versioned) |
| Encryption | S3-SSE |
| Verification | Daily restore into staging |
| RPO | 5 min |
| RTO | 15 min (warm standby) |

## Neo4j (forward-compat)

| Property | Value |
| --- | --- |
| Method | `neo4j-admin backup` (cluster-aware) |
| Frequency | Daily 03:00 UTC |
| Retention | 7 days |
| Storage | S3 |
| Encryption | S3-SSE |
| Verification | Daily restore into staging |
| RPO | 24 h |
| RTO | 1 h |

## Object storage

| Property | Value |
| --- | --- |
| Method | S3 cross-region replication (CRR) |
| Frequency | Continuous |
| Retention | Indefinite (versioned) |
| Storage | S3 in a second region |
| Encryption | S3-SSE |
| Verification | Weekly consistency check |
| RPO | 0 (replicated) |
| RTO | n/a (always available) |

## Vector database (pgvector)

The vector embeddings live in Postgres, so they inherit
the Postgres backup policy. The HNSW index is rebuilt as
part of the restore validation.

## Schedule

* **Daily 02:00 UTC** — full Postgres backup
* **Daily 03:00 UTC** — Neo4j backup (when enabled)
* **Hourly** — Redis RDB snapshot
* **Continuous** — Redis AOF, S3 CRR, WAL archive

## Verification

The recovery validation script (`scripts/recovery_validate.sh`)
runs weekly and:

1. Spins up a fresh cluster in the staging account.
2. Restores the most recent full backup.
3. Replays the WAL until the most recent transaction.
4. Boots the API in the staging cluster.
5. Runs the smoke test suite.
6. Records the result in `reports/security/recovery/`.
