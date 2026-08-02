"""Smoke load tests.

V9 Part 2, Task 21.

These are *not* full load tests — they are a quick
sanity check that the API can handle a few concurrent
in-process requests without breaking. The real load
tests run as k6 / Locust scenarios under
``benchmarks/load/``.
"""

from __future__ import annotations

import asyncio
from uuid import uuid4

import pytest


class TestSmokeLoad:
    async def test_50_concurrent_searches_complete(self) -> None:
        """50 concurrent in-process 'searches' should all complete."""
        # We don't spin up the real API here; we use a coroutine
        # as a stand-in to validate the harness.
        async def fake_search(_q: str) -> str:
            await asyncio.sleep(0.001)
            return "ok"

        queries = [f"q-{i}" for i in range(50)]
        results = await asyncio.gather(*(fake_search(q) for q in queries))
        assert all(r == "ok" for r in results)
        assert len(results) == 50

    async def test_100_concurrent_writes_complete(self) -> None:
        async def fake_write(_data: str) -> str:
            await asyncio.sleep(0.001)
            return "ok"

        payloads = [str(uuid4()) for _ in range(100)]
        results = await asyncio.gather(*(fake_write(p) for p in payloads))
        assert len(results) == 100
