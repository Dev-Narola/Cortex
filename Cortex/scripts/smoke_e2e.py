"""
End-to-end smoke test against a running deployment (no local stack needed).

    python scripts/smoke_e2e.py https://13-60-95-116.sslip.io

Creates a throwaway tenant (slug smoke-<random>) and exercises the PRD core:
register -> upload -> indexed -> hybrid search (+rerank) -> streamed chat
with citations -> usage events -> API key -> MCP tools (incl. a cross-tenant
attempt) -> SSRF guard -> KG entities. Prints one line per check and exits
non-zero if any check fails.
"""

from __future__ import annotations

import asyncio
import json
import sys
import time
import uuid

import httpx
import websockets

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")
API = f"{BASE}/api/v1"
DOC = (
    "Cortex Smoke Handbook. The Cortex platform stores document embeddings in "
    "PostgreSQL using the pgvector extension with halfvec columns. Hybrid search "
    "fuses full-text and vector rankings with reciprocal rank fusion before an "
    "LLM reranker reorders the candidates. The smoke-test codeword is "
    "PERIWINKLE-42."
)
failures: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> bool:
    print(f"[{'PASS' if ok else 'FAIL'}] {name}{' - ' + detail if detail else ''}")
    if not ok:
        failures.append(name)
    return ok


def items(resp: httpx.Response) -> list:
    """Endpoints return either a bare list or {"items": [...]}."""
    if resp.status_code != 200:
        return []
    body = resp.json()
    return body if isinstance(body, list) else body.get("items", [])


def register(c: httpx.Client, tag: str) -> tuple[str, str]:
    slug = f"smoke-{tag}-{uuid.uuid4().hex[:8]}"
    r = c.post(f"{API}/auth/register", json={
        "tenant_name": f"Smoke {tag}", "tenant_slug": slug,
        "email": f"{slug}@example.com", "password": "Smoke-Test-Password-1!",
    })
    r.raise_for_status()
    return r.json()["access_token"], slug


async def chat(token: str, conv_id: str) -> tuple[str, list[dict], list[str]]:
    ws_url = BASE.replace("https://", "wss://").replace("http://", "ws://")
    tokens, citations, types = [], [], []
    async with websockets.connect(f"{ws_url}/ws/conversations/{conv_id}?token={token}",
                                  open_timeout=20) as ws:
        await ws.send(json.dumps({"type": "message", "content": "What is the smoke-test codeword?"}))
        while True:
            frame = json.loads(await asyncio.wait_for(ws.recv(), timeout=120))
            types.append(frame["type"])
            if frame["type"] == "token":
                tokens.append(frame["content"])
            elif frame["type"] == "citation":
                citations.append(frame["citation"])
            elif frame["type"] in ("message_complete", "error"):
                if frame["type"] == "error":
                    tokens.append(f"<error {frame.get('code')}: {frame.get('message')}>")
                return "".join(tokens), citations, types


def main() -> int:
    c = httpx.Client(timeout=60)
    check("health/ready", c.get(f"{BASE}/health/ready").status_code == 200)
    check("ops endpoints not public",
          all(c.get(f"{BASE}{p}").status_code in (403, 404)
              for p in ("/metrics", "/system/status", "/api/v1/metrics", "/api/v1/system/status")))

    token, _ = register(c, "a")
    h = {"Authorization": f"Bearer {token}"}
    r = c.post(f"{API}/documents", headers=h,
               files={"file": ("smoke-handbook.txt", DOC.encode(), "text/plain")})
    check("upload accepted", r.status_code == 202, str(r.status_code))
    doc_id = r.json()["id"]

    status, deadline = "", time.time() + 240
    while time.time() < deadline:
        status = c.get(f"{API}/documents/{doc_id}/status", headers=h).json()["status"]
        if status in ("indexed", "failed"):
            break
        time.sleep(4)
    check("ingestion reaches indexed", status == "indexed", status)

    r = c.post(f"{API}/search/debug", headers=h, json={"query": "which extension stores embeddings"})
    if r.status_code == 404:
        r = c.post(f"{API}/search", headers=h, json={"query": "which extension stores embeddings"})
    body = r.json()
    results = body.get("results", body if isinstance(body, list) else [])
    check("hybrid search finds the chunk", r.status_code == 200 and any(
        doc_id == str(x.get("document_id")) for x in results), f"{r.status_code} {len(results)} results")

    conv = c.post(f"{API}/conversations", headers=h, json={"title": "smoke"}).json()["id"]
    answer, cites, types = asyncio.run(chat(token, conv))
    check("chat streams tokens", types.count("token") > 1, f"{types.count('token')} tokens")
    check("chat answer grounded", "PERIWINKLE" in answer.upper(), answer[:120])
    check("chat cites the document", any(x["document_id"] == doc_id for x in cites), f"{len(cites)} citations")
    msgs = items(c.get(f"{API}/conversations/{conv}/messages", headers=h))
    check("messages persisted", len(msgs) >= 2, f"{len(msgs)} messages")

    kinds = {e.get("event_type") for e in items(c.get(f"{API}/tenants/me/usage/events", headers=h))}
    check("usage events recorded", {"embedding", "completion"} <= kinds, str(sorted(kinds)))

    key = c.post(f"{API}/api-keys", headers=h, json={"name": "smoke", "scopes": ["documents:read"]}).json()
    k = {"X-API-Key": key["raw_key"]}
    check("API key lists documents", c.get(f"{API}/documents", headers=k).status_code == 200)
    mcp = lambda key_h, name, args: c.post(f"{API}/mcp", headers=key_h, json={  # noqa: E731
        "jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": args}}).json()
    got = mcp(k, "get_document", {"document_id": doc_id})
    check("MCP get_document", (got.get("result") or {}).get("document", {}).get("id") == doc_id)

    other_token, _ = register(c, "b")
    other_key = c.post(f"{API}/api-keys", headers={"Authorization": f"Bearer {other_token}"},
                       json={"name": "x", "scopes": ["documents:read"]}).json()["raw_key"]
    leaked = mcp({"X-API-Key": other_key}, "get_document", {"document_id": doc_id})
    check("MCP cross-tenant get_document refused", not leaked.get("result") and "PERIWINKLE" not in str(leaked))
    check("cross-tenant REST read refused",
          c.get(f"{API}/documents/{doc_id}", headers={"X-API-Key": other_key}).status_code == 404)
    ssrf = c.post(f"{API}/documents/url", headers=h, json={"url": "http://169.254.169.254/latest/meta-data/"})
    check("URL ingestion blocks metadata IP", ssrf.status_code == 400, str(ssrf.status_code))

    time.sleep(10)
    n = len(items(c.get(f"{API}/graph/entities", headers=h)))
    check("KG entities extracted", n > 0, f"{n} entities")

    print(f"\n{len(failures)} failure(s): {failures}" if failures else "\nall checks passed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
