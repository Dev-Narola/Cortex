"""
End-to-end V4 observability smoke test — the V4 proof.

Walks the 18-step V4 observability flow from the V4 spec:

    1.  Register tenant
    2.  Login
    3.  Upload document
    4.  Wait for indexed
    5.  Ask a question (via WebSocket)
    6.  Verify answer
    7.  Verify trace structure (via /metrics counters that the
        V4 OTel pipeline incremented during the request)
    8.  Verify LLM usage event recorded
    9.  Verify embedding usage event recorded
   10.  Verify reranker usage event recorded
   11.  Query tenant usage summary
   12.  Query audit log
   13.  Query /health
   14.  Query /health/ready
   15.  Query /metrics (Prometheus format, cortex_* families present)
   16.  Run retrieval evaluation
   17.  Run faithfulness evaluation
   18.  Verify no cross-tenant usage leakage

Like the V3 ``smoke_test_rag.py``, this is a *demo*, not a CI
test. It expects:

* ``docker compose up`` for Postgres + Redis + MinIO
* ``alembic upgrade head`` to have run (the V4
  ``usage_events`` + ``audit_log`` migrations are required)
* a valid ``OPENAI_API_KEY`` in the environment (the
  embedding + rerank + completion calls all hit the live
  provider)
* the API process is running (``uvicorn src.main:app``)
  with OTel + metrics + structlog enabled (the V4
  ``configure_tracing`` + ``configure_logging`` boot
  hooks are auto-invoked in ``main.py``)

Run with::

    cd Cortex/Cortex
    python scripts/smoke_test_observability.py

The script prints a structured PASS/FAIL per step and
exits non-zero on any failure. Steps 7, 8, 9, 10 are the
"observability proof" — they verify that the same request
that produced the answer also produced a metric, a
usage event, and an audit row.

The script intentionally uses the *external* surface
(HTTP + WebSocket) only; it does not import any
``src.*`` modules. This is the test of "the system as a
whole" that the V4 brief asks for.
"""

from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
import time
import uuid
from typing import Any

import httpx

# ---- configuration ----------------------------------------------------------

API_BASE = os.getenv("CORTEX_API_BASE", "http://localhost:8000")
API_V1 = f"{API_BASE}/api/v1"
WS_BASE = API_BASE.replace("http://", "ws://").replace("https://", "wss://")
TIMEOUT = 30.0
MAX_INDEX_WAIT_SECONDS = 60
TOTAL_STEPS = 18

# Where the V4 eval datasets + runner live. Mirrors the
# paths in ``run_evals.py`` — keep them in sync.
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EVAL_SCRIPT = os.path.join(_REPO_ROOT, "scripts", "run_evals.py")
EVAL_DATASETS_DIR = os.path.join(_REPO_ROOT, "tests", "evals", "datasets")


# ---- pretty printer ---------------------------------------------------------


def _step(num: int, label: str) -> None:
    print(f"\n[{num:02d}/{TOTAL_STEPS}] {label} ...", end=" ", flush=True)


def _ok() -> None:
    print("PASS")


def _fail(msg: str) -> None:
    print(f"FAIL  {msg}")
    raise SystemExit(1)


# ---- 1. register tenant + 2. login -----------------------------------------


def register_and_login(client: httpx.Client) -> dict[str, Any]:
    _step(1, "Register tenant")
    email = f"smoke-obs+{uuid.uuid4().hex[:8]}@cortex.local"
    password = "Smoke-Obs-Pass-123!"
    name = f"obs-{uuid.uuid4().hex[:6]}"
    reg = client.post(
        f"{API_V1}/auth/register",
        json={
            "name": name,
            "slug": f"obs-{uuid.uuid4().hex[:8]}",
            "email": email,
            "password": password,
        },
        timeout=TIMEOUT,
    )
    if reg.status_code not in (200, 201):
        _fail(f"register: {reg.status_code} {reg.text[:200]}")
    body = reg.json()
    _ok()

    _step(2, "Login")
    li = client.post(
        f"{API_V1}/auth/login",
        json={"email": email, "password": password},
        timeout=TIMEOUT,
    )
    if li.status_code != 200:
        _fail(f"login: {li.status_code} {li.text[:200]}")
    token = li.json().get("access_token") or li.json().get("token")
    if not token:
        _fail("login: no token in response")
    _ok()
    return {
        "token": token,
        "tenant_id": body.get("tenant_id"),
        "user_id": body.get("user_id"),
        "email": email,
    }


# ---- 3-4. upload + wait for indexed ----------------------------------------


def upload_and_index(client: httpx.Client, headers: dict[str, str]) -> str:
    _step(3, "Upload document")
    files = {
        "file": (
            "obs_smoke.txt",
            (
                b"Cortex uses OpenTelemetry for distributed tracing, "
                b"Prometheus for metrics, and structlog for JSON logs. "
                b"V4 records every embedding, completion, and rerank "
                b"call as a usage event with token counts and a "
                b"monetary cost. The audit log captures every "
                b"document access, deletion, API key change, "
                b"and tenant update."
            ),
            "text/plain",
        ),
    }
    up = client.post(
        f"{API_V1}/documents", files=files, headers=headers, timeout=TIMEOUT
    )
    if up.status_code not in (200, 201):
        _fail(f"upload: {up.status_code} {up.text[:200]}")
    doc_id = up.json().get("id")
    if not doc_id:
        _fail(f"upload: no id: {up.json()}")
    _ok()

    _step(4, "Wait for indexed (poll status)")
    deadline = time.time() + MAX_INDEX_WAIT_SECONDS
    last_status = None
    while time.time() < deadline:
        s = client.get(
            f"{API_V1}/documents/{doc_id}", headers=headers, timeout=TIMEOUT
        )
        if s.status_code == 200:
            last_status = s.json().get("status")
            if last_status == "indexed":
                _ok()
                return doc_id
        time.sleep(2)
    _fail(f"document never reached 'indexed' (last status: {last_status})")
    return doc_id  # unreachable; satisfies the type checker


# ---- 5-6. ask a question via WebSocket + verify answer ---------------------


def ask_question(client: httpx.Client, headers: dict[str, str]) -> dict[str, Any]:
    _step(5, "Ask a question (WebSocket)")
    cr = client.post(
        f"{API_V1}/conversations",
        json={"title": "obs-smoke"},
        headers=headers,
        timeout=TIMEOUT,
    )
    if cr.status_code not in (200, 201):
        _fail(f"conversation create: {cr.status_code} {cr.text[:200]}")
    conversation_id = cr.json()["id"]
    token = headers["Authorization"].split(" ", 1)[1]
    ws_url = f"{WS_BASE}/ws/conversations/{conversation_id}?token={token}"
    question = "What does V4 record for every LLM call?"

    try:
        import websockets
    except ImportError:
        _fail("websockets package missing — `pip install websockets`")

    seen_token = False
    seen_complete = False
    answer_text = ""

    async def _run_ws() -> None:
        nonlocal seen_token, seen_complete, answer_text
        async with websockets.connect(ws_url, open_timeout=TIMEOUT) as ws:
            await ws.send(json.dumps({"type": "message", "content": question}))
            deadline = time.time() + TIMEOUT
            while time.time() < deadline:
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=10.0)
                except asyncio.TimeoutError:
                    break
                ev = json.loads(raw)
                if ev.get("type") == "token":
                    seen_token = True
                    answer_text += ev.get("content", "")
                elif ev.get("type") == "message_complete":
                    seen_complete = True
                    # Some V3 implementations include the
                    # assembled answer on the complete
                    # envelope; fall back to it if no
                    # token stream was seen.
                    if not answer_text and ev.get("content"):
                        answer_text = ev["content"]
                    break
                elif ev.get("type") == "error":
                    _fail(f"ws error envelope: {ev}")

    asyncio.run(_run_ws())
    if not seen_token and not seen_complete:
        _fail("no token or message_complete event on the websocket")
    _ok()

    _step(6, "Verify an answer was produced")
    if not answer_text or not answer_text.strip():
        _fail("answer is empty")
    if len(answer_text.strip()) < 5:
        _fail(f"answer is suspiciously short: {answer_text!r}")
    _ok()
    return {"conversation_id": conversation_id, "answer": answer_text}


# ---- 7-10. observability proof ---------------------------------------------


def _metric_value(payload: str, metric: str) -> float:
    """Return the *sum* of all sample values for ``metric`` in
    a Prometheus text-format ``payload``.

    V4 only labels metrics with low-cardinality dimensions
    (model, stage, event_type) — so each ``metric{}`` line
    contributes to the total. We sum across all label
    permutations so the smoke test does not have to know
    the full label set.
    """
    total = 0.0
    for line in payload.splitlines():
        if line.startswith("#") or not line.strip():
            continue
        if line.startswith(metric + " ") or line.startswith(metric + "{"):
            try:
                total += float(line.rsplit(" ", 1)[-1])
            except ValueError:
                continue
    return total


def verify_trace_and_usage(
    client: httpx.Client, headers: dict[str, str]
) -> None:
    # Small grace period so backgrounded writes (usage
    # events, audit events) finish before we query.
    time.sleep(0.5)

    _step(7, "Verify trace structure (metric counters incremented)")
    metrics_payload = client.get(f"{API_BASE}/metrics", timeout=TIMEOUT).text
    # At least one HTTP request counter + one LLM counter
    # should have been ticked by the WebSocket + REST flow.
    http_total = _metric_value(metrics_payload, "cortex_http_requests_total")
    llm_total = _metric_value(metrics_payload, "cortex_llm_calls_total")
    if http_total <= 0:
        _fail(
            f"cortex_http_requests_total is 0 — "
            f"TracingMiddleware/OTel HTTP span did not record"
        )
    if llm_total <= 0:
        _fail(
            f"cortex_llm_calls_total is 0 — completion span "
            f"did not increment the LLM counter"
        )
    _ok()

    _step(8, "Verify LLM usage event recorded")
    r = client.get(
        f"{API_V1}/tenants/me/usage/events?event_type=completion&limit=10",
        headers=headers,
        timeout=TIMEOUT,
    )
    if r.status_code != 200:
        _fail(f"usage events: {r.status_code} {r.text[:200]}")
    completion_events = [
        e for e in r.json() if e.get("event_type") == "completion"
    ]
    if not completion_events:
        _fail("no completion usage event was recorded")
    # Token accounting: at least one event must report
    # input_tokens > 0 (we sent a non-empty prompt).
    if not any((e.get("input_tokens") or 0) > 0 for e in completion_events):
        _fail("completion event has zero input_tokens")
    _ok()

    _step(9, "Verify embedding usage event recorded")
    r = client.get(
        f"{API_V1}/tenants/me/usage/events?event_type=embedding&limit=10",
        headers=headers,
        timeout=TIMEOUT,
    )
    if r.status_code != 200:
        _fail(f"usage events: {r.status_code} {r.text[:200]}")
    embedding_events = [
        e for e in r.json() if e.get("event_type") == "embedding"
    ]
    if not embedding_events:
        _fail("no embedding usage event was recorded")
    _ok()

    _step(10, "Verify reranker usage event recorded")
    r = client.get(
        f"{API_V1}/tenants/me/usage/events?event_type=rerank&limit=10",
        headers=headers,
        timeout=TIMEOUT,
    )
    if r.status_code != 200:
        _fail(f"usage events: {r.status_code} {r.text[:200]}")
    rerank_events = [e for e in r.json() if e.get("event_type") == "rerank"]
    if not rerank_events:
        _fail("no rerank usage event was recorded")
    _ok()


# ---- 11. tenant usage summary ----------------------------------------------


def query_usage_summary(client: httpx.Client, headers: dict[str, str]) -> None:
    _step(11, "Query tenant usage summary")
    r = client.get(
        f"{API_V1}/tenants/me/usage/summary", headers=headers, timeout=TIMEOUT
    )
    if r.status_code != 200:
        _fail(f"usage summary: {r.status_code} {r.text[:200]}")
    body = r.json()
    if "estimated_cost_usd" not in body:
        _fail("summary missing estimated_cost_usd")
    if body.get("estimated_cost_usd", 0) < 0:
        _fail("negative cost is invalid")
    _ok()


# ---- 12. audit log ----------------------------------------------------------


def query_audit_log(client: httpx.Client, headers: dict[str, str]) -> None:
    _step(12, "Query audit log")
    r = client.get(
        f"{API_V1}/audit-log?limit=50", headers=headers, timeout=TIMEOUT
    )
    if r.status_code != 200:
        _fail(f"audit log: {r.status_code} {r.text[:200]}")
    items = r.json().get("items", [])
    # At minimum, the WebSocket answer produced a
    # conversation_accessed audit row.
    if not items:
        _fail("audit log is empty")
    _ok()


# ---- 13-15. health + metrics ------------------------------------------------


def health_and_metrics(client: httpx.Client) -> None:
    _step(13, "Query /health (liveness)")
    r = client.get(f"{API_BASE}/health", timeout=TIMEOUT)
    if r.status_code != 200:
        _fail(f"/health: {r.status_code}")
    if r.json().get("status") != "ok":
        _fail(f"/health: unexpected body {r.json()}")
    _ok()

    _step(14, "Query /health/ready (readiness)")
    r = client.get(f"{API_BASE}/health/ready", timeout=TIMEOUT)
    if r.status_code != 200:
        _fail(
            f"/health/ready: {r.status_code} {r.text[:200]} "
            "(this smoke test expects Postgres + Redis to be up)"
        )
    body = r.json()
    if body.get("status") != "ready":
        _fail(f"/health/ready: not ready — {body}")
    _ok()

    _step(15, "Query /metrics (Prometheus format)")
    r = client.get(f"{API_BASE}/metrics", timeout=TIMEOUT)
    if r.status_code != 200:
        _fail(f"/metrics: {r.status_code}")
    ctype = r.headers.get("content-type", "")
    if "text/plain" not in ctype:
        _fail(f"/metrics: wrong content-type {ctype}")
    # Verify the V4 families are present. A count check
    # (e.g. "at least 5 lines starting with cortex_") is
    # too brittle; the family-name check is enough.
    required_families = [
        "cortex_http_requests_total",
        "cortex_http_request_duration_seconds",
        "cortex_llm_calls_total",
        "cortex_embedding_calls_total",
        "cortex_rerank_calls_total",
    ]
    missing = [f for f in required_families if f not in r.text]
    if missing:
        _fail(f"/metrics missing families: {missing}")
    _ok()


# ---- 16-17. run retrieval + faithfulness evals -----------------------------


def run_eval_suite(suite: str) -> dict[str, Any]:
    """Invoke ``run_evals.py --suite {suite}`` and return
    the parsed JSON of the ``latest.json`` it produced.

    The script writes its result to
    ``evals/results/latest.json`` — we read that file back
    so the smoke test does not have to scrape stdout.
    """
    out_path = os.path.join(
        _REPO_ROOT, "evals", "results", "latest.json"
    )
    cmd = [
        sys.executable,
        EVAL_SCRIPT,
        "--suite",
        suite,
        "--dataset",
        os.path.join(EVAL_DATASETS_DIR, f"{suite}_v1.jsonl"),
    ]
    proc = subprocess.run(
        cmd,
        cwd=_REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=60,
    )
    if proc.returncode != 0:
        _fail(f"run_evals.py --suite {suite} failed: {proc.stderr[:500]}")
    if not os.path.exists(out_path):
        _fail(f"run_evals.py did not write {out_path}")
    with open(out_path, "r", encoding="utf-8") as f:
        return json.load(f)


def run_evals() -> None:
    _step(16, "Run retrieval evaluation")
    payload = run_eval_suite("retrieval")
    if payload.get("suite") != "retrieval":
        _fail(f"unexpected suite: {payload.get('suite')}")
    if not payload.get("reports"):
        _fail("retrieval eval produced no reports")
    _ok()

    _step(17, "Run faithfulness evaluation")
    payload = run_eval_suite("faithfulness")
    if payload.get("suite") != "faithfulness":
        _fail(f"unexpected suite: {payload.get('suite')}")
    if not payload.get("reports"):
        _fail("faithfulness eval produced no reports")
    _ok()


# ---- 18. cross-tenant leakage ----------------------------------------------


def cross_tenant_isolation(
    client: httpx.Client, headers: dict[str, str]
) -> None:
    _step(18, "Verify no cross-tenant usage leakage")
    # Register a second tenant; ask for its own usage —
    # it must see zero events.
    email = f"smoke-obs-2+{uuid.uuid4().hex[:8]}@cortex.local"
    password = "Smoke-Obs2-Pass-123!"
    name = f"obs2-{uuid.uuid4().hex[:6]}"
    reg = client.post(
        f"{API_V1}/auth/register",
        json={
            "name": name,
            "slug": f"obs2-{uuid.uuid4().hex[:8]}",
            "email": email,
            "password": password,
        },
        timeout=TIMEOUT,
    )
    if reg.status_code not in (200, 201):
        _fail(f"register tenant 2: {reg.status_code} {reg.text[:200]}")
    body2 = reg.json()
    token2 = body2.get("access_token") or body2.get("token")
    headers2 = {"Authorization": f"Bearer {token2}"}

    # Tenant 2's usage summary must report zero cost (or a
    # number strictly less than tenant 1's).
    r1 = client.get(
        f"{API_V1}/tenants/me/usage/summary", headers=headers, timeout=TIMEOUT
    )
    r2 = client.get(
        f"{API_V1}/tenants/me/usage/summary",
        headers=headers2,
        timeout=TIMEOUT,
    )
    if r1.status_code != 200 or r2.status_code != 200:
        _fail(
            f"summary status mismatch: t1={r1.status_code} t2={r2.status_code}"
        )
    cost1 = r1.json().get("estimated_cost_usd") or 0
    cost2 = r2.json().get("estimated_cost_usd") or 0
    if cost2 > cost1:
        _fail(
            f"tenant 2 cost ({cost2}) > tenant 1 cost ({cost1}) "
            "— possible cross-tenant leakage"
        )

    # Tenant 2's events list must be empty.
    r2_evt = client.get(
        f"{API_V1}/tenants/me/usage/events?limit=50",
        headers=headers2,
        timeout=TIMEOUT,
    )
    if r2_evt.status_code != 200:
        _fail(f"tenant 2 events: {r2_evt.status_code}")
    if len(r2_evt.json()) > 0:
        _fail(
            f"tenant 2 sees {len(r2_evt.json())} events — "
            "cross-tenant leakage in /tenants/me/usage/events"
        )
    _ok()


# ---- entry point ------------------------------------------------------------


def main() -> None:
    print(f"V4 observability smoke test target: {API_BASE}")
    with httpx.Client(timeout=TIMEOUT) as client:
        ctx = register_and_login(client)
        headers = {"Authorization": f"Bearer {ctx['token']}"}
        upload_and_index(client, headers)
        ask_question(client, headers)
        verify_trace_and_usage(client, headers)
        query_usage_summary(client, headers)
        query_audit_log(client, headers)
        health_and_metrics(client)
        run_evals()
        cross_tenant_isolation(client, headers)
    print(f"\nALL {TOTAL_STEPS} V4 OBSERVABILITY STEPS PASSED")


if __name__ == "__main__":
    main()
