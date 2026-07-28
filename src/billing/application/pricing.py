"""
Model pricing — the V4 rate table.

Separated from :mod:`src.billing.application.cost_calculator`
on purpose: the cost calculator is *business logic* (it
turns token counts into USD using a model-side rate), and
the pricing table is *configuration data* (it maps a
provider/model pair to a rate). Mixing the two means a
pricing change requires a code change; keeping them
separate means an operator can bump a rate without
redeploying.

The V4 architecture calls for the rate table to live in
configuration. This module provides the *defaults* — the
public, 2026-07-25 OpenAI + Anthropic rates — and a
lookup API the calculator uses. The actual production
rates can be overridden by:

* env vars (``CORTEX_LLM_COST_<model>_INPUT`` /
  ``CORTEX_LLM_COST_<model>_OUTPUT`` in USD per 1K
  tokens), or
* a future database-backed ``PricingSource`` (V5).

Pricing versioning (Phase 12 / ADR-0023): every model
rate carries an ``effective_from`` date. The calculator
returns the rate that was in force at the time of the
call; that value is then *persisted on the usage event*
so a later rate change does not retroactively change
historical invoices.

Anti-corruption:

* The module never imports from the calculator or the
  application services. It's a one-way dependency:
  calculator → pricing. (The pricing module is allowed
  to know what a "model" is; the calculator is allowed
  to know what a "token" is.)
* The module is *read-only* at runtime. Bumping a
  rate means deploying a new image; the in-process
  pricing snapshot never mutates after the calculator
  is constructed.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from typing import Any


# Bump this when the default rate table changes. The
# calculator picks up the new version automatically;
# usage events recorded under the old version keep
# ``pricing_version = "2026-07-25-defaults"`` and the
# cost column already reflects the old rate.
PRICING_VERSION: str = "2026-07-25-defaults"


@dataclass(frozen=True)
class ModelRate:
    """USD cost per 1K tokens (input / output) and the
    dollar-per-call rate when the model bills by request
    rather than token. Either or both may be set; the
    calculator picks the right one for the event type.

    ``effective_from`` is the date the rate became the
    authoritative one. Historical events are computed
    against the rate that was active at *their* time.
    """

    input_per_1k: float = 0.0
    output_per_1k: float = 0.0
    per_call: float = 0.0
    effective_from: date = field(default_factory=lambda: date(2026, 7, 25))

    def is_active_at(self, when: date | datetime) -> bool:
        """Return True if the rate was in force at ``when``."""
        when_d = when.date() if isinstance(when, datetime) else when
        return self.effective_from <= when_d


# Default rates — public prices, 2026-07-25. Override via
# env (CORTEX_LLM_COST_*) or by swapping the calculator at
# boot time.
DEFAULT_RATES: dict[str, ModelRate] = {
    # OpenAI
    "gpt-4o-mini":           ModelRate(input_per_1k=0.000_15, output_per_1k=0.000_60),
    "gpt-4o":                ModelRate(input_per_1k=0.002_50, output_per_1k=0.010_00),
    "o1-mini":               ModelRate(input_per_1k=0.003_00, output_per_1k=0.012_00),
    # OpenAI embeddings
    "text-embedding-3-small": ModelRate(input_per_1k=0.000_02, output_per_1k=0.0),
    "text-embedding-3-large": ModelRate(input_per_1k=0.000_13, output_per_1k=0.0),
    # Anthropic
    "claude-3-5-sonnet":     ModelRate(input_per_1k=0.003_00, output_per_1k=0.015_00),
    "claude-3-haiku":        ModelRate(input_per_1k=0.000_25, output_per_1k=0.001_25),
}


def _load_env_overrides(
    base: dict[str, ModelRate],
) -> dict[str, ModelRate]:
    """Apply env-var overrides to a copy of ``base``.

    Format: ``CORTEX_LLM_COST_<model>_INPUT`` /
    ``CORTEX_LLM_COST_<model>_OUTPUT`` in USD per 1K
    tokens. A private enterprise deal can therefore be
    applied without code changes — the next process
    restart picks up the new rate.

    The override keeps the existing ``effective_from``
    date; the *operator* knows when their private rate
    started, but we have no source-of-truth for that
    in V4. A V5 dashboard will record the override
    timestamp alongside the rate.
    """
    out: dict[str, ModelRate] = dict(base)
    for key, value in os.environ.items():
        if not key.startswith("CORTEX_LLM_COST_"):
            continue
        parts = key[len("CORTEX_LLM_COST_"):].rsplit("_", 1)
        if len(parts) != 2:
            continue
        model, side = parts
        try:
            rate = float(value)
        except ValueError:
            continue
        current = out.setdefault(model, ModelRate())
        if side == "INPUT":
            current = ModelRate(
                input_per_1k=rate,
                output_per_1k=current.output_per_1k,
                per_call=current.per_call,
                effective_from=current.effective_from,
            )
        elif side == "OUTPUT":
            current = ModelRate(
                input_per_1k=current.input_per_1k,
                output_per_1k=rate,
                per_call=current.per_call,
                effective_from=current.effective_from,
            )
        out[model] = current
    return out


def load_pricing(
    *,
    rates: dict[str, ModelRate] | None = None,
    pricing_version: str | None = None,
) -> dict[str, Any]:
    """
    Build the in-process pricing snapshot.

    Returns a dict with two keys:

    * ``"version"`` — the pricing version string
      (defaults to :data:`PRICING_VERSION`).
    * ``"rates"``  — the rate table, with env-var
      overrides applied. The returned dict is a
      *frozen* snapshot — the calculator must never
      mutate it.

    Tests can pass a fixed ``rates`` dict and a custom
    ``pricing_version`` to exercise the version-pinning
    code path without touching the environment.
    """
    base = rates if rates is not None else DEFAULT_RATES
    merged = _load_env_overrides(base)
    return {
        "version": pricing_version or PRICING_VERSION,
        "rates": merged,
    }


def rate_for(
    pricing: dict[str, Any],
    model: str | None,
    *,
    when: date | datetime | None = None,
) -> ModelRate:
    """
    Return the rate that applies to ``model`` at time
    ``when``. If the requested model has no rate in the
    snapshot, returns the empty ``ModelRate()`` (free).

    ``when`` defaults to *now* (UTC). The
    ``effective_from`` semantics let a future pricing
    change to be applied retroactively against the
    historical events table, by re-running each event
    against the rate that was in force at its
    ``created_at`` timestamp.
    """
    if not model:
        return ModelRate()
    rate = pricing["rates"].get(model, ModelRate())
    if when is None:
        return rate
    if not rate.is_active_at(when):
        # The model exists but the rate wasn't yet
        # active. We don't have a "previous rate"
        # snapshot, so we return the empty rate (free)
        # rather than a wrong one. A V5 change would
        # maintain a full history of rates.
        return ModelRate()
    return rate


__all__ = [
    "DEFAULT_RATES",
    "PRICING_VERSION",
    "ModelRate",
    "load_pricing",
    "rate_for",
]
