# Runbook — Security Incident

V9 Part 3, Task 37.

## Detection

* A security alert fires (anomalous login, mass
  permission denial, secret access from a new IP)
* A customer reports suspicious activity
* An external party notifies us of a vulnerability

## Immediate response

1. Page the security lead.
2. Open an incident ticket in the security tracker.
3. **DO NOT** reboot or roll back without consulting
   the security lead — evidence may be lost.
4. Capture the current state: logs, audit events,
   process state, network connections.
5. Isolate the affected host if applicable.

## Escalation

* **Always** escalate to the security lead.
* If the incident involves customer data, escalate to
  the legal team and the customer-success team.
* If the incident is a vulnerability disclosure,
  follow the responsible-disclosure process.

## Recovery

1. Contain the incident (disable the affected
   account, rotate the affected credentials, block
   the affected IPs).
2. Eradicate the root cause (patch the vulnerability,
   remove the malicious code).
3. Recover the affected services.
4. Verify the incident is closed.

## Validation

* The vulnerability is patched.
* The malicious actor no longer has access.
* The audit log is clean.
* The smoke test suite passes.

## Post-incident review

* Record the timeline in `reports/security/postmortems/`.
* Identify the root cause.
* File a follow-up action item.
* If customer data was exposed, file the required
  regulatory notifications.
