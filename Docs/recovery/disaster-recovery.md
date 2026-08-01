# Disaster Recovery Plan

V9 Part 3, Task 35.

## Objectives

| Metric | Target |
| --- | --- |
| RTO (full region loss) | 1 h |
| RTO (single AZ loss) | 15 min |
| RPO (full region loss) | 5 min (WAL archive) |
| RPO (single AZ loss) | 0 (synchronous replica) |

## Scenarios

### S1 — Single API instance crash

* **Detection:** load balancer health check.
* **Response:** the LB removes the instance from the
  target group. New traffic is routed to healthy
  instances.
* **Recovery:** the instance is replaced by the
  auto-scaling group; no operator action required.
* **RTO:** < 1 min.

### S2 — Database primary failure

* **Detection:** the health endpoint reports
  `unhealthy` for Postgres.
* **Response:** the failover controller promotes the
  synchronous replica. The application reconnects
  automatically.
* **Recovery:** the application re-establishes the
  connection pool (the resilience layer retries with
  backoff).
* **RTO:** 2 min.

### S3 — Database read replica failure

* **Detection:** the health endpoint reports
  `degraded` for the replica.
* **Response:** the read-routing layer falls back to
  the primary. Read traffic is slower but unaffected.
* **Recovery:** operations rebuilds the replica from
  the primary.
* **RTO:** 0 (no impact on users).

### S4 — Redis primary failure

* **Detection:** the health endpoint reports
  `unhealthy` for Redis.
* **Response:** the application falls back to a
  direct database query path. Cached reads are slower
  but still correct.
* **Recovery:** Redis Sentinel promotes a replica; the
  application reconnects.
* **RTO:** 5 min.

### S5 — Full region loss

* **Detection:** the global load balancer health
  check fails for the entire region.
* **Response:** DNS is switched to the secondary
  region (Route 53 health check). The secondary
  region boots from the most recent cross-region
  backup; WAL is replayed.
* **Recovery:** the smoke test suite runs in the
  secondary region; once it passes, traffic is
  re-enabled.
* **RTO:** 1 h.
* **RPO:** 5 min.

### S6 — Object storage region failure

* **Detection:** the health endpoint reports
  `unhealthy` for S3.
* **Response:** the secondary region S3 takes over
  via cross-region replication.
* **Recovery:** the application switches to the
  secondary endpoint; no data loss.
* **RTO:** 0.

### S7 — Secret compromise

* **Detection:** the secret rotation service flags an
  unexpected use of a long-lived credential.
* **Response:** the affected secret is rotated
  immediately; audit log is searched for the
  exposure window.
* **Recovery:** all dependent services are restarted
  with the new credential.
* **RTO:** 30 min.

### S8 — Database data corruption

* **Detection:** the application surfaces a constraint
  violation or the smoke tests fail after a migration.
* **Response:** the database is restored from the
  most recent verified backup; the application is
  rolled back to the previous release.
* **Recovery:** the smoke test suite is run; once it
  passes, traffic is re-enabled.
* **RTO:** 1 h.
* **RPO:** up to 1 h (the most recent full backup).

## Verification

The recovery validation script (`scripts/recovery_validate.sh`)
is run weekly; the run is recorded in
`reports/security/recovery/`. The script also produces
a status report for the production-readiness review.

## Communications

* **Internal:** the on-call engineer is paged via PagerDuty.
* **External:** status page is updated within 5 min of
  the incident start.
* **Customers:** the customer-success team is notified
  within 30 min if the incident lasts > 30 min.

## Post-incident review

Every incident triggers a blameless post-mortem within
5 business days. The post-mortem is stored in
`reports/security/postmortems/` and includes:

* Timeline
* Detection time
* Mitigation time
* Recovery time
* Customer impact
* Root cause
* Action items
