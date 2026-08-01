"""
``SecretRotationService`` — schedules + tracks rotation.

V9 Part 3, Task 30.

The service is intentionally simple: the *how* of rotation
depends on the secret (API keys can be rotated by the
provider; JWT signing keys need a two-step rollover; etc.).
The service tracks *which* secrets need rotation, *when*
they were last rotated, and surfaces the next-due time to
the operator dashboard.

The actual rotation logic is delegated to pluggable
handlers; the service just keeps the schedule.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Awaitable, Callable

from src.platform.secrets.provider import SecretNotFoundError, SecretProvider


@dataclass(frozen=True)
class RotationPolicy:
    """How often a secret is rotated."""

    name: str
    interval_days: int
    handler: Callable[[str], Awaitable[str]] | None = None


@dataclass
class _RotationState:
    last_rotated_at: datetime
    next_due_at: datetime
    last_error: str | None = None


@dataclass
class SecretRotationService:
    """Track and trigger secret rotation."""

    provider: SecretProvider
    policies: list[RotationPolicy] = field(default_factory=list)
    _state: dict[str, _RotationState] = field(default_factory=dict)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    def register(self, policy: RotationPolicy) -> None:
        self.policies.append(policy)
        now = datetime.now(UTC)
        self._state[policy.name] = _RotationState(
            last_rotated_at=now,
            next_due_at=now + timedelta(days=policy.interval_days),
        )

    def is_due(self, name: str, *, now: datetime | None = None) -> bool:
        state = self._state.get(name)
        if state is None:
            return False
        return (now or datetime.now(UTC)) >= state.next_due_at

    def due_secrets(self, *, now: datetime | None = None) -> list[str]:
        return [name for name in self._state if self.is_due(name, now=now)]

    async def rotate(self, name: str) -> str:
        """Rotate ``name`` and return the new value.

        Raises :class:`ValueError` if the secret is not
        registered.
        """
        async with self._lock:
            policy = next((p for p in self.policies if p.name == name), None)
            if policy is None:
                raise ValueError(f"unknown secret: {name!r}")
            if policy.handler is None:
                raise ValueError(f"no rotation handler for {name!r}")
            new_value = await policy.handler(name)
        now = datetime.now(UTC)
        previous = self._state.get(name)
        self._state[name] = _RotationState(
            last_rotated_at=now,
            next_due_at=now + timedelta(days=policy.interval_days),
        )
        return new_value

    def snapshot(self) -> dict[str, dict[str, str]]:
        return {
            name: {
                "last_rotated_at": state.last_rotated_at.isoformat(),
                "next_due_at": state.next_due_at.isoformat(),
                "last_error": state.last_error or "",
            }
            for name, state in self._state.items()
        }
