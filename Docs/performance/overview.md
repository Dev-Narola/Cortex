# Performance Engineering Overview

V9 Part 1, Task 12 + V9 Part 2 (cross-cutting).

This directory holds the performance-engineering deliverables
for Cortex: index review, cache strategy, queue optimisation,
and the per-surface benchmark reports.

## Documents

| File | What it covers |
| --- | --- |
| `index-review.md` | Postgres, pgvector, full-text, and forward-compat Neo4j indexes; per-query plan + improvement estimate |
| `cache-strategy.md` | L1/L2/L3 cache layers, key registry, TTLs, invalidation rules |
| `queue-optimization.md` | Per-queue concurrency, retries, DLQ, observability |
| `startup.md` | Application boot time, lazy initialisation wins |
| `ingestion.md` | Document upload + chunk + embed latency |
| `rag.md` | RAG pipeline (query embedding + retrieval + fusion + rerank + answer) |
| `graph-extraction.md` | Knowledge graph extraction latency |
| `mcp.md` | MCP server request handling latency |
| `workers.md` | Background worker throughput and tail latency |

## Methodology

Every optimisation is measured twice: once on the baseline
(before the change) and once on the candidate (after the
change). Reports compare:

* P50 / P95 / P99 latency
* Throughput (req/s)
* Memory peak RSS
* CPU peak %
* Database connection peak

The benchmark suite under ``benchmarks/`` is the source of
truth; manual ad-hoc measurements are not accepted as
evidence of an improvement.
