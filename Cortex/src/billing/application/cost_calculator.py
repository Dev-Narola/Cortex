"""
Cost calculator.

The V3 era's "rough estimate" lived in a single ``settings``
attribute. V4's contract is bigger: the calculator knows the
*per-model* rates (delegated to
:mod:`src.billing.application.pricing`), knows the per-event-
type unit interpretation, and is the single source of truth
that the billing pipeline reads from.

Why a class, not just a function:

* The cost model and the unit model are coupled. Putting them
  in one place means a developer changing one of them
  (e.g. adding a new model) has to look in only one file.
* It makes the cost model *testable* in isolation: the unit
  suite can call :func:`CostCalculator.estimate` against a
  fixture of known rates and assert the output.
* A future swap (e.g. a real Stripe metering backend) is a
  single class to replace.

Pricing data lives in :mod:`src.billing.application.pricing`
so the application code never embeds a rate. The calculator
*uses* the pricing; it doesn't *define* it. The pricing
version is exposed via :attr:`rate_version` and persisted on
the usage event so a historical event can be reconciled
against the rate that was in force when it was recorded
(Phase 12 / ADR-0023).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from src.billing.application.pricing import (
    DEFAULT_RATES,
    PRICING_VERSION,
    ModelRate,
    load_pricing,
    rate_for,
)


# Re-export the dataclass so existing call sites that
# imported ``ModelRate`` from this module keep working.
__all__ = ["CostCalculator", "DEFAULT_RATES", "ModelRate", "PRICING_VERSION"]


class CostCalculator:
    """
    Estimate cost for an LLM-shaped call.

    Usage:

        calc = CostCalculator()
        cost = calc.estimate(
            event_type="completion",
            model="gpt-4o-mini",
            input_tokens=1500,
            output_tokens=400,
        )

    The result is in **USD**, rounded to 6 decimal places.

    Pricing source resolution:

    1. If the constructor is called with ``pricing=...``,
       that snapshot is used as-is (no env-var parsing,
       no default table). This is the unit-test path.
    2. Otherwise, the constructor calls
       :func:`src.billing.application.pricing.load_pricing`
       which merges the default rate table with the
       ``CORTEX_LLM_COST_*`` env vars.

    The :attr:`rate_version` property is the version string
    of the active pricing snapshot. Callers persist it on
    the usage event so the row records *which* rate
    produced its cost.
    """

    def __init__(
        self,
        rates: dict[str, ModelRate] | None = None,
        *,
        pricing: dict[str, Any] | None = None,
    ) -> None:
        if pricing is not None:
            # Caller passed a fully-built snapshot.
            self._pricing: dict[str, Any] = pricing
        else:
            # Build the default + env-override snapshot.
            self._pricing = load_pricing(rates=rates)

    @property
    def rates(self) -> dict[str, ModelRate]:
        """Read-only view of the active rate table (useful
        for diagnostics and dashboards)."""
        return dict(self._pricing["rates"])

    @property
    def rate_version(self) -> str:
        """The version string of the active pricing
        snapshot. Persist this on the usage event so the
        row records *which* rate produced its cost."""
        return str(self._pricing.get("version", PRICING_VERSION))

    def estimate(
        self,
        *,
        event_type: str,
        model: str | None = None,
        input_tokens: int = 0,
        output_tokens: int = 0,
    ) -> float:
        """Return the USD cost estimate for a single call.

        Unknown models get ``0.0`` — we never *throw* on a
        missing rate, because (a) the application code should
        still complete a span even if the model is
        unrecognised, and (b) "free model" is a valid answer
        (V3's identity-reranker, for example, is free).
        """
        rate = rate_for(self._pricing, model)
        cost = 0.0
        if event_type == "completion":
            cost += (input_tokens / 1000.0) * rate.input_per_1k
            cost += (output_tokens / 1000.0) * rate.output_per_1k
        elif event_type == "embedding":
            cost += (input_tokens / 1000.0) * rate.input_per_1k
        elif event_type == "rerank":
            # Rerankers typically bill per request; we use
            # ``input_tokens`` as the "units" so the cost
            # model is uniform across event types.
            cost += (input_tokens / 1000.0) * rate.input_per_1k
            cost += rate.per_call
        return round(cost, 6)
