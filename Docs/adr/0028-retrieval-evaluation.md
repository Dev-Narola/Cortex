# ADR-0028: Retrieval evaluation strategy

**Status:** Accepted (V4)
**Date:** 2026-07-27
**Related:** [ADR-0014](0014-reciprocal-rank-fusion-for-hybrid-search.md), [ADR-0017](0017-hybrid-search-and-rrf.md), [ADR-0018](0018-reranking-strategy.md), [ADR-0026](0026-observability-example-trace.md)

## Context

After V4 ships a hybrid (vector + keyword) retrieval
pipeline with RRF fusion and an optional rerank step,
the team needs an answer to a question that V3 could
not answer: *is the retrieval actually any good, and is
the reranker helping?* Without a measurement loop, the
"is the V5 model swap going to hurt us?" question is
unanswerable except by gut feel.

The V4 brief calls for **three retrieval strategies**
(vector-only, keyword-only, hybrid-with-rerank) to be
compared against a small, deterministic dataset, with
regression detection. This ADR records what metrics
the team tracks, how the dataset is shaped, and how
regressions are detected.

## Decision

### Metrics

V4 tracks the four standard IR metrics:

| Metric     | Definition                                                   | What it answers |
| ---------- | ------------------------------------------------------------ | --------------- |
| Recall@K   | fraction of relevant items that appear in the top-K results, **counted as unique items** | "did we find the right things?" |
| Precision@K| fraction of the top-K results that are relevant              | "did we waste slots on irrelevant things?" |
| Hit Rate@K | 1.0 if at least one relevant item is in the top-K, else 0.0  | "did the user see *something* useful?" |
| MRR        | mean reciprocal rank of the first relevant item, 0.0 if none | "was the right thing *first*?" |

The K values evaluated in V4 are ``K ∈ {1, 2, 3, 5}``.
K=1 is "is the very first hit correct?" (a strict
MRR-like check); K=5 is the primary number reported
on the V4 dashboard, matching the conventional
"show the top 5" retrieval UX. The dataset's K
values are baked into ``tests/evals/datasets/retrieval_v1.jsonl``
and captured in the run result file
(``evals/results/{suite}_{date}.json``).

The four metrics are deliberately *deterministic*
functions of the result list and the ground truth.
No LLM judge is involved in V4 retrieval scoring —
the brief is explicit that faithfulness is where the
LLM judge lives (see ADR-0029), and retrieval is
ground-truth based.

### Dataset format

The V4 retrieval dataset is a JSONL file at
``tests/evals/datasets/retrieval_v1.jsonl`` (25
hand-curated cases in V4). Each line is a JSON object:

```json
{
  "id": "r-v1-0001",
  "query": "How are failed ingestion jobs retried?",
  "relevant_documents": ["doc-7c8d9e", "doc-2a3b4c"],
  "tags": ["ingestion", "retry"],
  "difficulty": "easy"
}
```

Three properties the format enforces:

1. **Document-level ground truth.** The dataset
   records which *documents* are relevant, not
   which *chunks* are relevant. This is the
   operator's honest knowledge of the corpus
   ("the user is looking for the 'retry policy'
   page"); the chunk-level match is a downstream
   detail. The V4 scoring path falls back to a
   document-level match when the retrieval result
   carries a chunk id (see ``RetrievalEvaluator``).

2. **No LLM-generated ground truth.** Every
   ``relevant_documents`` value was written by a
   human (the project owner) who knows the corpus.
   A LLM-generated dataset would be circular —
   the LLM that wrote the dataset is the same LLM
   we'd be measuring.

3. **Versioned by file path + content hash.** The
   dataset file is part of the repo (committed
   under git). The eval runner records a SHA-256
   of the file in the result JSON, so a future
   "did the dataset change between runs?"
   question is answerable with a single
   ``diff``.

### Strategies

The V4 evaluator compares three strategies on the
same dataset:

| Strategy    | Description                                       | Pipeline |
| ----------- | ------------------------------------------------- | -------- |
| ``vector``  | top-K by cosine distance on the embedding         | embed → vector_search |
| ``keyword`` | top-K by full-text search on the tsvector index  | keyword_search |
| ``hybrid``  | RRF fusion of vector + keyword, then rerank       | embed → vector + keyword → RRF → rerank |

The comparison is the *primary* output of the V4
retrieval eval — a single number (``recall@5``) for
each strategy, side by side, so the operator can see
"the hybrid + rerank beats both single-strategy
baselines by X points" or "actually, the rerank
hurts on the long-tail queries". The rerank
strategy itself is configurable; the V4 default
uses Cohere's ``rerank-english-v3.0``.

### Regression detection

V4 ships a *baseline* + *tolerance* check, not a
"must always improve" check. The reasoning is in
the brief: a single new model swap, a chunking
change, or a RRF-k tweak should not be expected to
raise every metric on every case. The
``regression_runner`` module in
``src/evaluation/application/regression_runner.py``
implements the contract:

```python
verdict = compare(
    baseline=load_baseline("tests/evals/baselines/retrieval_v1.json"),
    current=current_report,
    tolerance={"recall_at_5": 0.05, "mrr": 0.05},
)
```

A metric is a **regression** iff
``current < baseline - tolerance``. A metric is
an **improvement** iff
``current > baseline + tolerance``. Anything in
between is **unchanged**. The verdict is
materialised in the run's exit code (regression ⇒
non-zero for CI), and a plain-text report is
written to ``evals/results/regression.txt``.

The baseline JSON is committed to the repo:

```json
{
  "suite": "retrieval",
  "dataset_version": "v1",
  "metrics": {
    "hybrid": {
      "recall_at_5": 0.80,
      "mrr":        0.72,
      "hit_rate_at_5": 0.92,
      "precision_at_5": 0.55
    },
    "vector": {
      "recall_at_5": 0.72,
      "mrr":        0.61,
      ...
    },
    "keyword": {
      "recall_at_5": 0.55,
      "mrr":        0.48,
      ...
    }
  }
}
```

When the eval runner sees a regression, the
*report file* still records the current numbers
— the regression does not erase the data, it
flags it. A human review (or a follow-up commit)
is the response.

### Where the metrics live

The metrics are **library code**, not a CLI flag.
The ``src/evaluation/domain/metrics`` module
exposes pure functions:

```python
recall_at_k(retrieved, relevant, k) -> float
precision_at_k(retrieved, relevant, k) -> float
hit_rate_at_k(retrieved, relevant, k) -> float
mrr(retrieved, relevant) -> float
aggregate_metrics(cases) -> dict[str, float]
```

Each function is unit-tested with hand-rolled
deterministic fixtures in
``tests/evals/test_retrieval_metrics.py``
(rank-1 / rank-2 / rank-5 / not-found / empty /
deduplicate cases). The library is what the
``RetrievalEvaluator`` consumes, what the
regression runner compares against, and what a
future "ad-hoc check" call uses.

## Consequences

### Positive

* Retrieval quality is *measurable*. A PR that
  changes the chunking strategy can run
  ``python scripts/run_evals.py --suite retrieval``
  and see the effect, in numbers, before merging.
* The hybrid + rerank baseline is *committed*.
  Future contributors know what the bar is.
* The dataset is small (25 cases) and versioned.
  A contributor who wants to add a case writes a
  new JSONL line and bumps the ``dataset_version``
  in the baseline file.
* The LLM is not in the loop. Retrieval scoring is
  CPU-only and runs in <1s on a laptop.

### Negative

* 25 cases is not statistically robust. The
  operator reads the eval as "directional", not
  "definitive". A V5 milestone is a 200+ case
  dataset drawn from anonymised production
  queries.
* The rerank model is a *paid* dependency in
  the V4 default (Cohere). The V4 retrieval eval
  therefore costs money to run against the live
  API; the CI runs against a *mock* reranker to
  keep the pipeline deterministic (see
  ``tests/evals/test_regression.py`` for the
  fixture shape).
* The regression tolerance is hand-tuned. A
  future contributor who doesn't read this ADR
  might be tempted to "tighten" the tolerance
  to ``0.0`` and create an always-failing CI.

## Reference

* The dataset: ``tests/evals/datasets/retrieval_v1.jsonl``
* The runner: ``scripts/run_evals.py --suite retrieval``
* The metrics: ``src/evaluation/domain/metrics.py``
* The evaluator: ``src/evaluation/application/retrieval_eval.py``
* The regression check: ``src/evaluation/application/regression_runner.py``
* The tests: ``tests/evals/test_retrieval_metrics.py``,
  ``tests/evals/test_regression.py``
