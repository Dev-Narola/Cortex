# Capacity Planning

V9 Part 2, Task 25.

This document captures the recommended infrastructure sizing
for three growth stages. The numbers are derived from the
benchmark suite under `benchmarks/` and validated against the
load test scenarios in `tests/load/`.

## Assumptions

* **Average tenant:** 50 documents, 2,500 chunks,
  50 MCP requests / day, 200 agent invocations / day.
* **Document growth:** 10% / month.
* **Peak burst:** 5× the average per-tenant load.
* **Database storage:** ~5 KB per chunk + embedding;
  1 KB per graph entity; 0.5 KB per graph relation.

## 100 tenants

| Resource | API | Workers | DB primary | Redis | Object storage |
| --- | --- | --- | --- | --- | --- |
| CPU | 2 vCPU | 4 vCPU | 2 vCPU | 1 vCPU | n/a |
| Memory | 4 GB | 8 GB | 8 GB | 1 GB | n/a |
| Storage | n/a | n/a | 100 GB | 10 GB | 50 GB |
| Network | 100 Mbps | 100 Mbps | 1 Gbps | 1 Gbps | 100 Mbps |
| DB connections | 30 | 30 | 200 max | n/a | n/a |
| API instances | 2 | n/a | n/a | n/a | n/a |
| Worker processes | n/a | 3 | n/a | n/a | n/a |

## 1,000 tenants

| Resource | API | Workers | DB primary | DB replica | Redis | Object storage |
| --- | --- | --- | --- | --- | --- | --- |
| CPU | 8 vCPU | 16 vCPU | 8 vCPU | 4 vCPU | 2 vCPU | n/a |
| Memory | 16 GB | 32 GB | 32 GB | 16 GB | 4 GB | n/a |
| Storage | n/a | n/a | 500 GB | 500 GB | 20 GB | 500 GB |
| Network | 1 Gbps | 1 Gbps | 10 Gbps | 10 Gbps | 10 Gbps | 1 Gbps |
| DB connections | 200 | 200 | 800 max | n/a | n/a | n/a |
| API instances | 6 | n/a | n/a | n/a | n/a | n/a |
| Worker processes | n/a | 12 | n/a | n/a | n/a | n/a |

## 10,000 tenants

| Resource | API | Workers | DB primary | DB replica ×2 | Redis cluster | Object storage |
| --- | --- | --- | --- | --- | --- | --- |
| CPU | 32 vCPU | 64 vCPU | 32 vCPU | 16 vCPU each | 8 vCPU | n/a |
| Memory | 64 GB | 128 GB | 128 GB | 64 GB each | 16 GB | n/a |
| Storage | n/a | n/a | 2 TB | 2 TB each | 50 GB | 5 TB |
| Network | 10 Gbps | 10 Gbps | 25 Gbps | 25 Gbps | 25 Gbps | 10 Gbps |
| DB connections | 800 | 800 | 3,000 max | n/a | n/a | n/a |
| API instances | 24 | n/a | n/a | n/a | n/a | n/a |
| Worker processes | n/a | 48 | n/a | n/a | n/a | n/a |

## Cost target

The 1,000-tenant target fits comfortably in the
mid-tier AWS / GCP offering (~$3-5k / month). The
10,000-tenant target requires a reserved-instance
commitment; cost is in the $25-40k / month range
depending on the negotiated discount.

## Verification

The capacity model is validated by the k6 / Locust
scenarios in `tests/load/`. The scenarios replay
realistic tenant behaviour and assert that the SLOs
listed in `Docs/operations/slos.md` are met.
