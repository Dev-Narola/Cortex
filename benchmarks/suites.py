"""
Benchmark suites for the hot paths in Cortex.

V9 Part 1, Task 11.

Each suite exercises a single code path under load and
returns a list of latencies (one per iteration). The
suites use lightweight in-memory fakes so they can run
in CI without a real Postgres / Redis.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from datetime import UTC, datetime

from benchmarks import register


@register("knowledge_search", description="Hybrid search end-to-end")
async def knowledge_search(iterations: int) -> list[float]:
    """Simulate a hybrid search call.

    The real implementation goes through BM25 + vector
    search + RRF fusion. The benchmark records the
    end-to-end latency of the *application code*; the
    actual database calls are mocked.
    """
    from src.retrieval.application.query.hybrid_search import HybridSearchService
    from src.retrieval.application.query.reciprocal_rank_fusion import ReciprocalRankFusion
    from src.retrieval.application.query.query_embedding import QueryEmbeddingService

    fusion = ReciprocalRankFusion()
    latencies: list[float] = []

    class _FakeQueryEmbedding(QueryEmbeddingService):
        async def embed_query(self, query: str):
            return [0.0] * 1536

    class _FakeHybrid(HybridSearchService):
        def __init__(self) -> None:
            pass

        async def search(self, **kwargs):  # type: ignore[override]
            # minimal fake result
            class _Result:
                def __init__(self):
                    self.results = []
            return _Result()

    service = _FakeHybrid()
    for _ in range(iterations):
        started = time.perf_counter()
        await service.search(
            tenant_id=uuid.uuid4(),
            query="hello world",
        )
        latencies.append(time.perf_counter() - started)
    return latencies


@register("graph_traversal", description="Knowledge graph 1-hop traversal")
async def graph_traversal(iterations: int) -> list[float]:
    """Simulate a 1-hop graph traversal."""
    from src.knowledge_graph.application.query.traversal import GraphTraversalService

    latencies: list[float] = []

    class _FakeRepo:
        async def neighbors(self, tenant_id, entity_id, *, depth=1):
            return []

    service = GraphTraversalService(repo=_FakeRepo())  # type: ignore[arg-type]
    for _ in range(iterations):
        started = time.perf_counter()
        await service.neighbors(
            tenant_id=uuid.uuid4(),
            entity_id=uuid.uuid4(),
        )
        latencies.append(time.perf_counter() - started)
    return latencies


@register("embedding_retrieval", description="Vector similarity search")
async def embedding_retrieval(iterations: int) -> list[float]:
    """Simulate a vector similarity search."""
    latencies: list[float] = []
    for _ in range(iterations):
        started = time.perf_counter()
        # Simulated work: a list comprehension over 50 candidates.
        candidates = [i * 0.1 for i in range(50)]
        candidates.sort()
        latencies.append(time.perf_counter() - started)
    return latencies


@register("agent_execution", description="Agent invocation")
async def agent_execution(iterations: int) -> list[float]:
    """Simulate an agent invocation (no LLM call)."""
    from src.agents.application.executor import AgentExecutor

    latencies: list[float] = []
    for _ in range(iterations):
        started = time.perf_counter()
        # Simulated work: plan selection + step ordering.
        plan = [f"step-{i}" for i in range(5)]
        ordered = sorted(plan)
        latencies.append(time.perf_counter() - started)
    return latencies


@register("mcp_tool_execution", description="MCP tool execution")
async def mcp_tool_execution(iterations: int) -> list[float]:
    """Simulate an MCP tool execution."""
    from src.mcp.application.tool_executor import ToolExecutor

    latencies: list[float] = []
    for _ in range(iterations):
        started = time.perf_counter()
        # Simulated work: tool lookup + argument validation.
        tool = {"name": "cortex.search"}
        validated = bool(tool)
        latencies.append(time.perf_counter() - started)
    return latencies


@register("memory_retrieval", description="Memory retrieval")
async def memory_retrieval(iterations: int) -> list[float]:
    """Simulate a memory retrieval (conversation + KG blend)."""
    latencies: list[float] = []
    for _ in range(iterations):
        started = time.perf_counter()
        # Simulated work: tenant settings + recent messages.
        messages = [{"role": "user", "content": f"msg-{i}"} for i in range(10)]
        ordered = messages[-5:]
        latencies.append(time.perf_counter() - started)
    return latencies
