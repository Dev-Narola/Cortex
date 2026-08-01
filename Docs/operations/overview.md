# Operations

V9 Part 4, Task 48.

This directory holds the operational documentation for
Cortex. Each runbook is executable by a new engineer
without tribal knowledge.

## Index

| Runbook | Description |
| --- | --- |
| `deployment.md` | First-time + repeat deployment |
| `rollback.md` | Rolling back a release |
| `scaling.md` | Adding / removing capacity |
| `database-migration.md` | Running an Alembic migration |
| `worker-recovery.md` | Recovering a stuck worker |
| `incident-handling.md` | Generic incident response |
| `monitoring.md` | Reading the dashboards |
| `backup-validation.md` | Verifying the backups |
| `disaster-recovery.md` | Region-wide recovery |

## On-call

* The on-call rotation is managed in PagerDuty.
* The on-call engineer owns:
  * Triage (page → acknowledge within 5 min)
  * Mitigation (apply the runbook)
  * Communication (status page + customer-success)
  * Post-incident review (within 5 business days)
* The on-call engineer is paged for:
  * 5xx rate > 1% for 5 min
  * Readiness probe failing for 2 min
  * Queue depth > 1,000 for 5 min
  * Worker count = 0 for 1 min
  * Any SEV-1 customer report

## Dashboards

The Grafana dashboards (in `infrastructure/grafana/`) cover:

* API latency + error rate
* Worker throughput + queue depth
* Database connection pool + query latency
* Redis hit rate + memory pressure
* LLM provider latency + cost
* Object storage latency + error rate

## SLOs

| SLO | Target |
| --- | --- |
| API P95 latency | < 200 ms |
| API P99 latency | < 500 ms |
| API availability | 99.9% |
| Worker success rate | > 99.5% |
| Search P95 latency | < 300 ms |

## Capacity

See `Docs/scaling/capacity-planning.md` for the
sizing model and `Docs/scaling/horizontal-scaling.md`
for the scaling strategy.
