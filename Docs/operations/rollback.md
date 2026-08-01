# Rollback Runbook

V9 Part 4, Task 48.

## When to roll back

* 5xx rate > 5% for 5 min
* Critical user-facing bug confirmed
* A migration failed and cannot be reversed in place

## How to roll back

```bash
./scripts/rollback.sh v0.9.0
```

The script:

1. Tags the current image as `cortex:previous`.
2. Deploys the requested tag.
3. Runs the post-deploy smoke test.
4. Reports the result.

## Post-rollback

1. Update the status page.
2. Open an incident ticket.
3. Start the post-incident review.
4. File a follow-up action item.

## Caveats

* **Database migrations:** if the rolled-back release
  expects an older schema, run `alembic downgrade -1`
  before rolling back. The script refuses to roll back
  across a breaking migration.
* **Long-running jobs:** any in-flight LLM or extraction
  job from the new release will complete in the old
  release. Acceptable; documented in the runbook.
