# ADR-0025: Coverage policy and fail-under bar

**Status:** Accepted (V4)
**Date:** 2026-07-26

## Context

The PRD requires a *real* coverage bar — "coverage
cannot silently decrease." V4 is the first version
of Cortex with an enforced threshold.

The brief is explicit: "The exact number should be
chosen based on your existing 201+ V1 tests and V2/V3
suite." The V3-alpha baseline is 418 unit tests + 10
eval tests + 1 V4 unit test = 429 tests, with a
measured line coverage of 67.4 % on the
``src/`` tree (V4-2026-07-26 snapshot).

The brief's example ``fail_under = 80`` is a *target*,
not the V4 bar. Setting the bar at 80 % on day one
would block the V4 release on coverage gaps the V4
team hasn't had time to close; the brief's actual
requirement is "cannot silently decrease" — the bar
must be the **current** bar, then lifted over time.

## Decision

### V4 baseline

* **Threshold:** ``fail_under = 67`` in
  ``pyproject.toml`` (matches the V4-measured line
  coverage of 67.4 %).
* **Measurement scope:** line coverage on
  ``src/`` (omitting ``__init__.py`` and the
  ``__pycache__`` directories).
* **Branch coverage:** *off* in V4. The V4 codebase
  has many small exhaustive paths; branch coverage
  doesn't add meaningful signal at this stage. V5
  re-measures with branch coverage on and bumps the
  bar accordingly.

### Per-layer visibility

The report includes a per-package breakdown; the
``fail_under`` only checks the total, but the
operator can read the per-package row to find the
"where do I add tests next?" answer. The critical
layers — domain, application, security, retrieval,
billing — are reported in the same table.

### What is excluded

* All ``__init__.py`` files (they're trivially
  imported, not *executed*).
* Test files (the unit suite measures
  ``src/``; the test files themselves are
  meta-infrastructure).
* Lines tagged ``# pragma: no cover`` — the
  operator can opt-out a single line when there's
  a deliberate reason (e.g. ``raise
  NotImplementedError`` in a stub).

### What is NOT excluded (and why)

* **Domain entities.** Even dataclass ``__post_init__``
  branches are counted. A future "remove this
  validation" refactor that drops a branch must
  drop the bar visibly; coverage protects against
  silent deletions.
* **Billing cost model.** The cost calculator is
  small but every method is a different cost path;
  the operator can see at a glance which paths are
  exercised.
* **Audit log repository.** Append-only is enforced
  by *absence* of methods on the repository, and
  coverage can detect a future developer adding a
  ``delete()`` method to the port — the test would
  have to call it, the metric would shift.

### CI enforcement

The CI workflow (``.github/workflows/ci.yml``) runs
``pytest --cov`` and the ``fail_under`` rule is
applied at the test level. A coverage drop below
the bar **fails the build** — no manual override
short of editing ``pyproject.toml`` (which is a
deliberate, reviewable change).

### V5 roadmap

* Lift the bar to 75 % after the integration tests
  land (V4's OTel infrastructure goes from 0 % to
  ~40 % as soon as a live OTel SDK is exercised).
* Lift the bar to 80 % after the V5 rate-limiter +
  cost-quota + audit-trail end-to-end tests land.
* Flip ``branch = true`` once branch coverage is
  ≥ 60 %; the V4 bar of 67 % (line only) maps to
  roughly 50 % (branch), so this is a 6-month
  journey.

## Consequences

* A test that removes a single line of business
  logic without removing the corresponding test
  will see a coverage drop, which the CI will
  catch.
* A new module added with zero tests will see a
  coverage drop, which the CI will catch.
* A future developer who *wants* to drop coverage
  has to edit ``pyproject.toml``, which is a
  visible, reviewable change.
* The bar is a *floor*, not a *goal*. Coverage is
  necessary but not sufficient — a test that
  exercises a line without asserting anything
  about it doesn't make the system more correct.
  The unit tests assert behaviour; the eval tests
  assert quality. The bar enforces the floor; the
  review enforces the quality.

## References

* ADR-0023: Usage events and cost model (the
  billing layer is one of the per-layer rows
  visible in the coverage report).
* ADR-0014-0017, 0019: V3 retrieval and LLM
  provider abstractions (the retrieval layer is
  another per-layer row).
