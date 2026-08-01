# Runbook — Credential Leak

V9 Part 3, Task 37.

## Detection

* A secret is found in a public place (GitHub, logs,
  chat, support ticket)
* Anomaly detection on the audit log flags unusual
  secret access
* The provider reports a compromised credential

## Immediate response

1. **DO NOT ROTATE FIRST** — if the leak is
   still-active, the attacker may be using the
   credential. Contain first.
2. Page the security lead.
3. Disable the leaked credential at the provider if
   possible.
4. Block the IP / API key at the WAF.
5. Check the audit log for usage of the credential
   during the exposure window.

## Escalation

* **Always** escalate to the security lead.
* If customer data is involved, escalate to the
  legal team and the customer-success team.
* If the leak is on a public channel, escalate to the
  communications team.

## Recovery

1. Rotate the credential via `SecretRotationService`.
2. Update the secret in the secret store.
3. Restart the dependent services.
4. Re-issue any derived tokens (e.g. JWT signing keys).
5. Notify the affected customers.

## Validation

* The new credential is in use.
* The old credential is disabled.
* The audit log shows no further misuse.
* The smoke test suite passes.

## Post-incident review

* Record the timeline in `reports/security/postmortems/`.
* Identify how the leak happened.
* File a follow-up action item (e.g. add a pre-commit
  secret scanner).
