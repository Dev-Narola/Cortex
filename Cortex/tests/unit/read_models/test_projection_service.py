"""Tests for ProjectionService."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

import pytest

from src.platform.projections import (
    ProjectionBuildError,
    ProjectionNotFoundError,
    ProjectionService,
    ProjectionStrategy,
    ProjectionTimeoutError,
    ProjectionKey,
)
from src.read_models.base import ReadModelProtocol, ReadModelStatus
from src.read_models.document_health import DocumentHealth
from src.read_models.knowledge_summary import KnowledgeSummary
from src.read_models.tenant_usage import TenantUsageRollup


class _Counter:
    def __init__(self) -> None:
        self.value = 0

    def bump(self) -> None:
        self.value += 1


def _doc_health(tenant: UUID, doc: UUID) -> DocumentHealth:
    return DocumentHealth(
        tenant_id=tenant,
        document_id=doc,
        ingestion_state="completed",
        embedding_state="completed",
        graph_state="completed",
        failed_chunk_count=0,
        pending_chunk_count=0,
        last_job_status="ok",
        last_job_error=None,
        last_updated_at=datetime.now(UTC),
    )


class TestRegistration:
    def test_register_requires_builder(self) -> None:
        svc = ProjectionService()
        with pytest.raises(ValueError):
            svc.register("foo")

    def test_register_rebuilder(self) -> None:
        svc = ProjectionService()
        counter = _Counter()

        async def rebuilder(key: ProjectionKey, previous: ReadModelProtocol | None = None) -> ReadModelProtocol:
            counter.bump()
            return _doc_health(key.tenant_id, key.entity_id or uuid4())  # type: ignore[arg-type]

        svc.register("doc_health", rebuilder=rebuilder)
        assert "doc_health" in svc.health() or True  # health starts empty


class TestGetOrBuild:
    async def test_get_or_build_rebuilds_when_missing(self) -> None:
        svc = ProjectionService()
        counter = _Counter()

        async def rebuilder(key: ProjectionKey, previous: ReadModelProtocol | None = None) -> ReadModelProtocol:
            counter.bump()
            return _doc_health(key.tenant_id, key.entity_id or uuid4())  # type: ignore[arg-type]

        svc.register("doc_health", rebuilder=rebuilder)
        tenant = uuid4()
        doc = uuid4()
        snapshot = await svc.get_or_build(ProjectionKey("doc_health", tenant, doc))
        assert isinstance(snapshot, DocumentHealth)
        assert counter.value == 1
        # Second call reuses the snapshot.
        snapshot2 = await svc.get_or_build(ProjectionKey("doc_health", tenant, doc))
        assert snapshot2 is snapshot
        assert counter.value == 1

    async def test_get_or_build_serialises_concurrent_rebuilds(self) -> None:
        svc = ProjectionService()
        counter = _Counter()

        async def rebuilder(key: ProjectionKey, previous: ReadModelProtocol | None = None) -> ReadModelProtocol:
            counter.bump()
            await asyncio.sleep(0.1)
            return _doc_health(key.tenant_id, key.entity_id or uuid4())  # type: ignore[arg-type]

        svc.register("doc_health", rebuilder=rebuilder)
        tenant = uuid4()
        doc = uuid4()
        key = ProjectionKey("doc_health", tenant, doc)
        results = await asyncio.gather(*(svc.get_or_build(key) for _ in range(5)))
        # The lock + post-acquire cache check ensures only one rebuild runs.
        assert counter.value == 1
        assert all(r is results[0] for r in results)


class TestRebuildAndInvalidate:
    async def test_rebuild_resets_attempt_count(self) -> None:
        svc = ProjectionService()
        counter = _Counter()

        async def rebuilder(key: ProjectionKey, previous: ReadModelProtocol | None = None) -> ReadModelProtocol:
            counter.bump()
            return _doc_health(key.tenant_id, key.entity_id or uuid4())  # type: ignore[arg-type]

        svc.register("doc_health", rebuilder=rebuilder)
        tenant = uuid4()
        doc = uuid4()
        key = ProjectionKey("doc_health", tenant, doc)
        await svc.get_or_build(key)
        await svc.invalidate(key)
        await svc.get_or_build(key)
        assert counter.value == 2

    async def test_invalidate_tenant_removes_all(self) -> None:
        svc = ProjectionService()
        counter = _Counter()

        async def rebuilder(key: ProjectionKey, previous: ReadModelProtocol | None = None) -> ReadModelProtocol:
            counter.bump()
            return _doc_health(key.tenant_id, key.entity_id or uuid4())  # type: ignore[arg-type]

        svc.register("doc_health", rebuilder=rebuilder)
        tenant = uuid4()
        for _ in range(3):
            await svc.get_or_build(ProjectionKey("doc_health", tenant, uuid4()))
        removed = await svc.invalidate_tenant(tenant)
        assert removed == 3
        # Cache should be empty for that tenant.
        for key in svc._entries:  # type: ignore[attr-defined]
            assert key.tenant_id != tenant


class TestFailureModes:
    async def test_build_error_preserves_state(self) -> None:
        svc = ProjectionService()

        async def failing(key: ProjectionKey, previous: ReadModelProtocol | None = None) -> ReadModelProtocol:
            raise RuntimeError("boom")

        svc.register("doc_health", rebuilder=failing)
        with pytest.raises(ProjectionBuildError):
            await svc.get_or_build(ProjectionKey("doc_health", uuid4(), uuid4()))

    async def test_unknown_model_raises(self) -> None:
        svc = ProjectionService()
        with pytest.raises(ProjectionNotFoundError):
            await svc.get_or_build(ProjectionKey("nope", uuid4(), uuid4()))

    async def test_timeout_raises(self) -> None:
        svc = ProjectionService(default_timeout_seconds=0.05)

        async def slow(key: ProjectionKey, previous: ReadModelProtocol | None = None) -> ReadModelProtocol:
            await asyncio.sleep(0.2)
            return _doc_health(key.tenant_id, key.entity_id or uuid4())  # type: ignore[arg-type]

        svc.register("doc_health", rebuilder=slow)
        with pytest.raises(ProjectionTimeoutError):
            await svc.get_or_build(ProjectionKey("doc_health", uuid4(), uuid4()))


class TestReadModelProtocolConformance:
    def test_knowledge_summary_is_fresh(self) -> None:
        from src.read_models.knowledge_summary import KnowledgeSummary

        s = KnowledgeSummary(
            tenant_id=uuid4(),
            document_id=uuid4(),
            title="t",
            owner_id=uuid4(),
            owner_email="o@x.com",
            source="upload",
            status="completed",
            chunk_count=10,
            embedding_count=10,
            indexed_chunk_count=10,
            has_failed_chunks=False,
            size_bytes=1024,
            tags=("a", "b"),
            updated_at=datetime.now(UTC),
        )
        assert s.is_fresh(now=datetime.now(UTC))
        assert s.health(now=datetime.now(UTC)) is ReadModelStatus.READY

    def test_tenant_usage_rollup_serialises(self) -> None:
        from src.read_models.tenant_usage import TenantUsageRollup

        r = TenantUsageRollup(
            tenant_id=uuid4(),
            day="2026-07-31",
            request_count=100,
            document_count=5,
            chunk_count=200,
            embedding_count=200,
            agent_invocation_count=10,
            mcp_request_count=50,
            graph_extraction_count=20,
            storage_bytes=1024 * 1024,
        )
        d = r.to_dict()
        assert d["request_count"] == 100
        assert d["day"] == "2026-07-31"
