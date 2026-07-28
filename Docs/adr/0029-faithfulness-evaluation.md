# ADR-0029: Faithfulness evaluation strategy

**Status:** Accepted (V4)
**Date:** 2026-07-27
**Related:** [ADR-0019](0019-llm-provider-abstraction.md), [ADR-0021](0021-conversation-context-management.md), [ADR-0028](0028-retrieval-evaluation.md), [ADR-0026](0026-observability-example-trace.md)

## Context

Retrieval quality (ADR-0028) answers "did the system
find the right documents?" — but the user-visible
question is "did the system *use* the right documents
to answer?". The two are not the same: a perfectly
retrieved document can be ignored, partially quoted,
or contradicted by a hallucinated claim in the model's
answer. Faithfulness is the metric that captures the
gap.

The V4 brief calls for a deterministic faithfulness
evaluation with regression detection. This ADR
records what "faithfulness" means in V4, how the V4
evaluator decides it, and where the LLM judge's
known limits are accounted for.

## Decision

### What faithfulness means in V4

An answer is **faithful** iff every claim it makes
about the world is *supported* by the retrieved
context the system gave the model. An answer is
**unfaithful** iff it makes at least one claim that
the context does not support.

Two properties the definition enforces:

1. **Grounded in context, not in truth.** The
   faithfulness score is computed against the
   *retrieved context*, not against ground truth.
   If the retrieval is wrong, the answer can still
   be faithful to a wrong context — and the V4
   system reports that as "faithful, with a
   caveat: the underlying context was bad". The
   retrieval metric (ADR-0028) catches the
   retrieval side; the faithfulness metric catches
   the *use* side.

2. **No claim is "in the air".** A faithful answer
   is one where every sentence is either (a)
   supported by a span in the context, or (b)
   explicitly framed as a refusal / unknown
   ("the document does not say"). The V4 scoring
   penalises a sentence that is *neither* — that
   is the failure mode faithfulness is meant to
   catch.

### How claims are evaluated

The V4 evaluator (``FaithfulnessEvaluator``) supports
two extraction modes, with the dataset dictating
which one runs:

| Mode      | How claims are extracted                                          | How support is decided                                              |
| --------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| ``simple``| Heuristic: split the answer on sentence boundaries, lowercase, strip punctuation | A claim is "supported" iff some sentence in the context *contains* the claim as a substring |
| ``manual``| The dataset author hand-writes a list of ``supported_claims`` and ``unsupported_claims`` per case | A claim is "supported" iff it is in the ``supported_claims`` list   |

The V4 dataset (``tests/evals/datasets/faithfulness_v1.jsonl``)
uses ``manual`` mode exclusively. The reasoning is in
the brief: the operator's paraphrased answers don't
substring-match the context, so the simple substring
heuristic produces a stream of false negatives on the
very cases the eval is meant to measure. Manual mode
removes the heuristic from the loop and gives the
operator a deterministic, auditable answer per case.

A V5 change would add an LLM-judge mode (using
a different model than the one being evaluated,
with a separate ``gen_ai.system`` label so the two
are distinguishable in metrics). The mode is
*opt-in* — V4 stays deterministic so CI is fast and
reproducible.

### Dataset format

```json
{
  "id": "f-v1-0001",
  "context": "Cortex uses PostgreSQL with the pgvector extension for hybrid retrieval.",
  "answer":  "Cortex uses PostgreSQL.",
  "extraction_mode": "manual",
  "supported_claims":     ["Cortex uses PostgreSQL."],
  "unsupported_claims":   [],
  "tags": ["ground-truth", "database"]
}
```

The dataset is 20 hand-curated cases. Three
properties the format enforces:

1. **One ground-truth answer per case.** The
   ``answer`` field is the model's response, written
   by the operator against the same context. The
   faithfulness scorer does not see a *second* model
   call — the dataset is the answer.

2. **Explicit supported / unsupported lists.** The
   operator enumerates *every claim* the answer
   makes, sorted into the two buckets. This is
   manual labour, but it is the deterministic
   ground truth. Without it, the V4 scorer would
   either trust the simple heuristic (false
   negatives) or a future LLM judge (circular).

3. **Versioned by file path + content hash.** Same
   as the retrieval dataset (ADR-0028) — the
   file is committed; the runner records a
   SHA-256 in the result JSON.

### Scoring

For a case, the V4 scorer computes:

```python
n_supported     = len(case.supported_claims)
n_unsupported   = len(case.unsupported_claims)
total_claims    = n_supported + n_unsupported
case_score      = n_supported / total_claims        # 0.0 to 1.0
```

The aggregate metric is the mean of case scores
across the dataset (the brief calls for a single
``Faithfulness: ...`` number on the V4 dashboard).
The V4 CI gate is:

```python
MIN_FAITHFULNESS = 0.80
assert aggregate >= MIN_FAITHFULNESS
```

The 0.80 floor is a *deliberate* choice: a
deterministic dataset of 20 cases can support a
loose threshold (a tighter one would over-fit the
hand-curated cases). A V5 milestone is to lift the
floor to 0.85 once the dataset grows to 100+
cases drawn from production.

### Regression detection

Same shape as the retrieval regression
(ADR-0028): a baseline JSON, a tolerance, and a
``regression_runner`` invocation. The V4 baseline
records the mean score per dataset version; the
runner flags a regression iff
``current < baseline - tolerance``. The
``MIN_FAITHFULNESS`` floor is the *absolute*
gate; the regression runner is the *trend* gate.
Both are wired into ``tests/evals/test_faithfulness.py``
and ``tests/evals/test_regression.py``.

## Limitations of LLM judges (V5 territory)

The V4 evaluation is *deterministic on purpose*. The
brief is explicit: a V4 LLM judge is out of scope. The
known limits the V5 work has to grapple with are:

1. **Judge bias.** An LLM judge that uses the same
   model family as the one being evaluated will
   systematically over-rate *its own* answers. A
   judge that uses a *different* model is biased
   the other way. There is no neutral judge.

2. **Cost.** A faithfulness eval that calls the
   judge for every claim is a paid operation
   (tokens × cases × claims). The V4 manual mode
   pays zero; a V5 LLM judge would add a
   measurable line to the cost summary.

3. **Non-determinism.** Even at temperature=0, an
   LLM judge will occasionally produce a different
   answer on a re-run. The V4 deterministic eval
   has a CI-friendly "always the same answer"
   property that an LLM judge would erode.

4. **Adversarial prompts.** A judge that asks
   "is this answer supported by the context?" can
   be gamed by an answer that *mis-quotes* the
   context. A faithful-by-judge answer that
   cherry-picks half a sentence and reverses the
   meaning is a known failure mode. The V4 manual
   mode does not have this problem because the
   operator wrote the supported / unsupported
   split themselves.

The V4 evaluator's design is shaped by these limits
even though it does not contain an LLM judge: the
``supported_claims`` / ``unsupported_claims`` split
is the *contract* a future V5 LLM judge would
have to satisfy. The judge's output would be
diffed against the operator's manual split; the
judge is checked, not trusted.

## Consequences

### Positive

* The system's *use* of the retrieved context is
  measured. A future operator looking at the V4
  dashboard sees three numbers side by side:
  *retrieval* (did we find it?), *faithfulness*
  (did we use it?), *cost* (was it worth it?).

* The 0.80 floor is committed. A future
  contributor who changes the prompt template
  and accidentally drops faithfulness to 0.65
  fails the test suite.

* The deterministic V4 eval is fast (sub-second
  on a laptop) and free (no API calls). It is a
  natural fit for the V4 CI gate.

### Negative

* The manual mode is *labour*. Writing 20 cases
  with hand-curated supported / unsupported
  splits took longer than writing the V4
  retrieval dataset (which is just
  document-level ground truth). A V5 milestone
  is to graduate cases from manual to
  LLM-judge-confirmed.

* A V4 answer that is *correct but not in the
  context* is scored as "unsupported" — the
  brief accepts this as the conservative
  choice. A V5 might introduce a third bucket
  ("true but ungrounded") with a separate
  metric.

## Reference

* The dataset: ``tests/evals/datasets/faithfulness_v1.jsonl``
* The runner: ``scripts/run_evals.py --suite faithfulness``
* The evaluator: ``src/evaluation/application/faithfulness_eval.py``
* The floor: ``tests/evals/test_faithfulness.py::MIN_FAITHFULNESS``
* The regression check: ``src/evaluation/application/regression_runner.py``
