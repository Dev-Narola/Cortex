"""Multi-level cache + invalidation framework.

V9 Part 2, Task 17.

* :class:`CacheInvalidationService` is the platform-level
  abstraction the application uses to invalidate by key,
  by tenant, or by pattern. It never serves cross-tenant
  data.
* :class:`MultiLevelCache` is a thin wrapper that fronts
  Redis with the L1 application cache. The L1 cache is
  process-local; the L2 cache is Redis.
"""

from __future__ import annotations

from src.platform.cache.invalidation import (
    CacheInvalidationError,
    CacheInvalidationService,
    InvalidationReason,
)
from src.platform.cache.multi_level import MultiLevelCache

__all__ = [
    "CacheInvalidationError",
    "CacheInvalidationService",
    "InvalidationReason",
    "MultiLevelCache",
]
