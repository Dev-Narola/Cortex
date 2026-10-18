"""Performance regression tests.

V9 Part 4, Task 41.

Each test runs the corresponding benchmark suite from
``benchmarks/`` and compares the result to the recorded
baseline. The baseline is stored in
``benchmarks/baselines/<suite>.json`` and updated by the
release pipeline.

A regression > 15% from the baseline fails the test.
"""

from __future__ import annotations
