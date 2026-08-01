# Worker Recovery Runbook

V9 Part 4, Task 48.

## Detection

* `cortex_worker_active{queue=...}` drops to 0
* Queue depth is climbing (see `runbooks/queue-backlog.md`)

## Immediate response

1. SSH into the worker host.
2. `ps aux | grep arq` — find the worker process.
3. Check the worker logs:
   `journalctl -u cortex-worker -n 200`.
4. If the process is alive but stuck, restart it:
   `systemctl restart cortex-worker`.
5. If the process is dead, the orchestrator will start
   a new one.

## Stuck job

A job is stuck if `cortex_worker_active{job=...}` is
non-zero for > 30 min.

1. Identify the job id from the dashboard.
2. Check the job in the queue:
   `arqctl list-jobs <queue>`.
3. If the job is stuck, abort it:
   `arqctl abort <queue> <job_id>`.
4. The job moves to the dead-letter queue.
5. The DLQ is drained by the on-call engineer.

## Replay

To replay the dead-letter queue:

```bash
./scripts/replay_dlq.sh <queue>
```

The script moves DLQ entries back to the active queue
in batches of 100.
