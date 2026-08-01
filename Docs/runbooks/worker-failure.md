# Runbook — Worker Failure

V9 Part 3, Task 37.

## Detection

* `cortex_worker_active{queue=...}` drops to 0 for > 1 min
* The worker heartbeat is missing in the dashboard
* Queue depth is climbing (see `queue-backlog.md`)

## Immediate response

1. SSH into the worker host.
2. Check the worker process: `ps aux | grep arq`.
3. Check the worker logs for the last error.
4. If the process is alive but stuck, restart it.
5. If the process is dead, the orchestrator will start
   a new one.

## Escalation

* If the worker keeps crashing, escalate to the
  platform team.
* If the failure is caused by a bad release, roll back
  per `docs/operations/rollback.md`.

## Recovery

1. The orchestrator restarts the worker.
2. The worker re-pulls jobs from the queue.
3. The queue depth returns to the target.

## Validation

* `cortex_worker_active{queue=...}` is back to the
  expected count.
* Queue depth is back to the target.
* The smoke test suite passes.

## Post-incident review

* Record the timeline in `reports/security/postmortems/`.
* Identify the root cause.
* File a follow-up action item.
