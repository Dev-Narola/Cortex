"""Distributed locking primitives.

V9 Part 2, Task 15.

The :class:`DistributedLockService` coordinates critical
sections across multiple API / worker processes. It is used
to:

* prevent duplicate ingestion of the same document;
* prevent duplicate graph extraction for the same chunk;
* serialise projection rebuilds;
* coordinate the scheduled-job guard.

The implementation is a thin Redis wrapper using
``SET NX PX`` with an automatic renewal goroutine
(``renew``) and safe release (``release``).
"""

from __future__ import annotations

from src.platform.locking.service import (
    DistributedLock,
    DistributedLockError,
    DistributedLockLostError,
    DistributedLockNotAcquiredError,
    DistributedLockService,
)

__all__ = [
    "DistributedLock",
    "DistributedLockError",
    "DistributedLockLostError",
    "DistributedLockNotAcquiredError",
    "DistributedLockService",
]
