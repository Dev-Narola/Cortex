# ADR-0030: NVIDIA as a second LLM provider

**Status:** Accepted (V11)
**Date:** 2026-08-11

## Context

OpenAI credits are temporarily unavailable. The Cortex backend
has been on a single-provider architecture (OpenAI) since V1.
The ``LLMProvider`` port in
:mod:`src.conversation.domain.ports` is the seam; the
:mod:`src.agents.infrastructure.llm_provider` abstract base is
the seam for the agent bounded context. Both exist so the
provider is swappable; we just hadn't needed to exercise that
seam yet.

The PRD requires Cortex to remain "frontend-completable,
deployable, and testable end-to-end" — the platform cannot
hard-fail when the primary vendor is unavailable.

## Decision

Add **NVIDIA NIM** as a second LLM provider. Selection is
**configuration-driven** via the existing
``LLM_PROVIDER`` setting (now accepts ``"openai"`` or
``"nvidia"``). The provider is selected in
:func:`src.core.dependencies.get_conversation_llm_provider`
(conversation / RAG) and
:func:`src.core.dependencies.get_llm_provider` (agent); both
factories share the same selection logic so the platform can
swap providers atomically.

The **NVIDIA NIM** REST surface is OpenAI-compatible. We
reuse the existing ``openai`` Python SDK as the HTTP client
— no new dependency — and point it at NVIDIA's
``base_url`` with a different ``api_key`` and ``model``.

## Why this approach

* **OpenAI compatibility.** NIM exposes
  ``/v1/chat/completions`` with the same request/response
  shape and the same streaming SSE protocol. The
  ``AsyncOpenAI`` client works against it unchanged.
* **No new dependency.** The OpenAI Python SDK is already
  a hard dependency; we don't add a NVIDIA-specific SDK
  just to talk to an OpenAI-shaped endpoint.
* **Provider port preserved.** The conversation-domain
  :class:`LLMProvider` port and the agents-context
  :class:`LLMProvider` ABC remain the boundaries; the
  application code is unaware of the swap.
* **Configuration-driven.** The platform is a Cortex, not an
  OpenAI deployment; provider selection must be a config
  value, not a code change.
* **Async + streaming preserved.** The NIM SDK call is
  ``AsyncOpenAI.chat.completions.create(..., stream=True)``
  with the same ``async for chunk in stream`` iteration;
  token-by-token streaming works identically.

## Alternatives considered

* **Continue OpenAI only.** Rejected — the trigger for this
  work is the credit outage, and a single-provider
  deployment is a single point of failure.
* **Hugging Face Inference Endpoints.** Rejected for now —
  HF's API surface is not OpenAI-shaped, would require a
  new SDK or a custom HTTP client, and the agent loop's
  tool-calling conventions are not universally supported
  across HF models.
* **Local model hosting (vLLM / TGI).** Rejected for the
  same reasons as HF, plus a deployment-cost spike for
  GPU hosts.
* **NVIDIA-specific Python SDK.** Rejected — there isn't
  one in mainstream use; the NIM endpoint is the
  OpenAI-compatible REST surface and the OpenAI SDK is
  the right HTTP client.

## Consequences

**Positive:**

* Provider flexibility: one config flag switches the
  whole platform between two vendors.
* No application code changes when swapping providers —
  the application layer remains vendor-agnostic.
* Existing OpenAI path is preserved verbatim; a config
  rollback is trivial.
* The factory pattern means a future V12 provider
  (Anthropic, Cohere, local) is a new adapter + a new
  branch in the factory, not a rewrite.

**Negative:**

* Two providers to test: the OpenAI provider contract
  is exercised by the existing test suite; the NVIDIA
  provider has its own parallel unit test suite
  (``tests/unit/conversation/infrastructure/test_nvidia_provider.py``).
* Provider-specific model behaviour: NVIDIA's
  ``openai/gpt-oss-20b`` is a different model family
  than ``gpt-4o-mini``. Tool-calling conventions and
  reasoning behaviour may differ. The agent loop's
  tool-calling + safeguard pipeline is exercised
  through the V6/V9 tests; the NIM provider's
  tool-calling fidelity is verified manually on the
  deployed backend before relying on it for production
  agent runs.
* Token accounting: NIM's ``usage`` object has the
  same fields as OpenAI's, so the existing billing
  integration maps cleanly. If a future provider
  doesn't supply usage, the billing path needs to
  be made defensive.
* ``NVIDIA_API_KEY`` is a new secret in the
  deployment surface. The same
  ``SECRETS_MANAGER_ENABLED`` flow that supplies
  ``OPENAI_API_KEY`` now supplies
  ``NVIDIA_API_KEY``.

## Operational notes

* ``LLM_PROVIDER=openai`` is the default; a config
  rollback is a one-line change.
* Production deploy:

  ```
  LLM_PROVIDER=nvidia
  NVIDIA_API_KEY=<from-secrets-manager>
  ```

* The deployed container is restartable; a config
  change requires only a ``docker compose up -d`` (or
  the equivalent ``start.sh``) — no rebuild.

## Status

Accepted and shipped. 17 new tests (13 provider +
4 factory). All existing tests still pass.
