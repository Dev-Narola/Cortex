# Runbook — Database Failure

V9 Part 3, Task 37.

## Detection

* `cortex_db_up == 0` for > 30 s
* `cortex_db_pool_wait_seconds` > 1 s
* `/health/ready` returns 503

## Immediate response

1. Page the on-call DBA via PagerDuty.
2. Open the database runbook in the operations console.
3. Check the RDS console for the primary status.
4. If the primary is failing health checks, the failover
   controller will promote the replica automatically.
5. If the failover does not trigger, run
   `aws rds failover-db-cluster --db-cluster-identifier cortex-prod`.

## Escalation

* If the failover does not complete in 5 min, escalate
  to the database team lead.
* If the failover fails entirely, escalate to the AWS
  support team (severity 1).

## Recovery

1. Verify the new primary accepts connections.
2. Update the connection string in the secret store.
3. Restart the API instances so they pick up the new
   connection string.
4. Replay the WAL until the application catches up.
5. Verify the smoke test suite passes.

## Validation

* `/health/ready` returns 200.
* `cortex_db_up == 1` for 5 min.
* The smoke test suite (`tests/load/smoke.py`) passes.
* The dashboard shows no in-flight errors.

## Post-incident review

* Record the timeline in `reports/security/postmortems/`.
* Identify the root cause (network, hardware, overload).
* File a follow-up action item.
