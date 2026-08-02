"""
Unit tests for the V7 Knowledge Graph extraction worker.

Covers the Phase 8 spec:

* :func:`enqueue_graph_extraction` is a thin
  helper that the rest of the application calls
  to fire a job. The function's contract is
  "delegate to Redis" — the test substitutes an
  in-memory fake.
* :func:`_classify_exception` translates the
  domain exceptions into the worker error
  categories.
* The Arq task :func:`graph_extraction_task`
  drives the pipeline through the
  :class:`Neo4jSessionManager` context. A stub
  manager + stub LLM keeps the test focused on
  the orchestration rather than the LLM call.
"""

from __future__ import annotations

import uuid

import pytest

from src.knowledge_graph.application.extraction import (
    EntityExtractionService,
    GraphExtractionPipeline,
    RelationshipExtractionService,
    RuleBasedExtractionProvider,
)
from src.knowledge_graph.domain.exceptions import GraphExtractionFailed
from src.knowledge_graph.infrastructure.session import (
    GraphTransactionContext,
    Neo4jSessionManager,
)
from src.knowledge_graph.infrastructure.workers import (
    PermanentExtractionError,
    TransientExtractionError,
    _classify_exception,
    enqueue_graph_extraction,
    graph_extraction_task,
)
from src.shared.exceptions import ValidationException


class TestClassifyException:
    """The classifier translates domain exceptions to worker categories."""

    def test_validation_exception_is_permanent(self):
        exc = ValidationException(message="bad input", code=400)
        wrapped = _classify_exception(exc)
        assert isinstance(wrapped, PermanentExtractionError)
        assert wrapped.original is exc

    def test_graph_extraction_failed_is_transient(self):
        exc = GraphExtractionFailed(message="rate limit", code=500)
        wrapped = _classify_exception(exc)
        assert isinstance(wrapped, TransientExtractionError)
        assert wrapped.original is exc

    def test_permanent_extraction_error_passthrough(self):
        exc = PermanentExtractionError("x")
        wrapped = _classify_exception(exc)
        assert wrapped is exc

    def test_unknown_is_transient(self):
        wrapped = _classify_exception(RuntimeError("?"))
        assert isinstance(wrapped, TransientExtractionError)


class TestEnqueueGraphExtraction:
    """The enqueue helper delegates to Redis."""

    @pytest.mark.asyncio
    async def test_enqueue_calls_redis(self):
        class _FakeRedis:
            def __init__(self):
                self.calls: list = []

            async def enqueue_job(self, name, **payload):
                self.calls.append((name, payload))
                class _Job:
                    job_id = "fake-job-id"
                return _Job()

        redis = _FakeRedis()
        doc_id = uuid.uuid4()
        tenant_id = uuid.uuid4()
        result = await enqueue_graph_extraction(
            redis, document_id=doc_id, tenant_id=tenant_id
        )
        assert result == "fake-job-id"
        assert len(redis.calls) == 1
        name, payload = redis.calls[0]
        assert name == "graph_extraction_task"
        assert payload["document_id"] == str(doc_id)
        assert payload["tenant_id"] == str(tenant_id)
        # No defer-by when ``defer_by_seconds`` is 0.
        assert "_defer_by" not in payload or payload["_defer_by"] is None

    @pytest.mark.asyncio
    async def test_enqueue_with_defer(self):
        class _FakeRedis:
            def __init__(self):
                self.calls: list = []

            async def enqueue_job(self, name, **payload):
                self.calls.append((name, payload))
                class _Job:
                    job_id = "j2"
                return _Job()

        redis = _FakeRedis()
        await enqueue_graph_extraction(
            redis,
            document_id=uuid.uuid4(),
            tenant_id=uuid.uuid4(),
            defer_by_seconds=15.0,
        )
        assert redis.calls[0][1]["_defer_by"] == 15.0


class TestGraphExtractionTask:
    """The Arq task drives the pipeline."""

    @pytest.mark.asyncio
    async def test_invalid_uuid_raises_permanent(self):
        with pytest.raises(PermanentExtractionError):
            await graph_extraction_task(
                ctx={"graph_session_manager": None},
                document_id="not-a-uuid",
                tenant_id=str(uuid.uuid4()),
            )

    @pytest.mark.asyncio
    async def test_missing_session_manager_raises_runtime(self):
        with pytest.raises(RuntimeError):
            await graph_extraction_task(
                ctx={},
                document_id=str(uuid.uuid4()),
                tenant_id=str(uuid.uuid4()),
            )

    @pytest.mark.asyncio
    async def test_end_to_end_extraction(self):
        """The worker drives the pipeline through the transaction context.

        The test uses a stub session manager that
        records the calls instead of touching a
        real database. The point of the test is
        the orchestration — the pipeline gets
        invoked, the LLM provider is wired in,
        the result dict is shaped correctly.
        """
        from src.knowledge_graph.application.extraction import (
            EntityCandidate,
        )

        class _RecordingSessionManager(Neo4jSessionManager):
            def __init__(self):
                super().__init__(
                    backend="postgres",
                    session_factory=lambda: None,
                )
                self.transaction_called = False
                self.last_tenant_id = None

            def get_session(self):
                # Not used by the worker — it
                # always uses the ``transaction``
                # context manager.
                return None

            def execute_transaction(self, callback, *, tenant_id=None):  # type: ignore[override]
                raise NotImplementedError

        captured: dict = {}

        class _StubTransactionContext:
            def __init__(self, *, session, tenant_id):
                self.session = session
                self.tenant_id = tenant_id

            def __enter__(self):
                # The pipeline only uses ``session``;
                # we pass a mock-like object that
                # exposes the methods the pipeline
                # calls.
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

        class _StubProvider:
            """Stand-in for ``RuleBasedExtractionProvider``."""

            async def extract_entities(self, text):
                return [EntityCandidate(name="Cortex", entity_type="project")]

            async def extract_relationships(self, text, entities):
                # No edges — the test is happy with
                # the entity branch alone.
                return []

        class _StubPipeline:
            def __init__(self, **kwargs):
                captured["kwargs"] = kwargs

            async def extract_for_document(self, *, tenant_id, document_id):
                captured["tenant_id"] = tenant_id
                captured["document_id"] = document_id
                from src.knowledge_graph.application.extraction import (
                    ExtractionResult,
                    ExtractionMetrics,
                )
                return ExtractionResult(
                    document_id=document_id,
                    tenant_id=tenant_id,
                    entities=[],
                    relationships=[],
                    metrics=ExtractionMetrics(),
                )

        mgr = _RecordingSessionManager()
        mgr.connect()

        # Monkey-patch the context-manager
        # machinery the worker uses. We swap the
        # ``transaction`` method for one that
        # returns our stub context, and swap the
        # pipeline class for our stub.
        from contextlib import contextmanager

        @contextmanager
        def _txn(*, tenant_id):
            mgr.transaction_called = True
            mgr.last_tenant_id = tenant_id
            yield _StubTransactionContext(session=None, tenant_id=tenant_id)

        mgr.transaction = _txn  # type: ignore[method-assign]

        import src.knowledge_graph.infrastructure.workers as workers_module
        import src.knowledge_graph.infrastructure.session as session_module

        original_pipeline = workers_module.GraphExtractionPipeline
        original_tx_ctx = session_module.GraphTransactionContext
        workers_module.GraphExtractionPipeline = _StubPipeline
        session_module.GraphTransactionContext = _StubTransactionContext

        try:
            document_id = uuid.uuid4()
            tenant_id = uuid.uuid4()
            result = await graph_extraction_task(
                ctx={
                    "graph_session_manager": mgr,
                    "llm_provider": None,
                    "graph_extraction_provider_factory": lambda llm: _StubProvider(),
                },
                document_id=str(document_id),
                tenant_id=str(tenant_id),
            )
        finally:
            workers_module.GraphExtractionPipeline = original_pipeline
            session_module.GraphTransactionContext = original_tx_ctx

        # The transaction was opened with the
        # right tenant id (the spec's
        # defense-in-depth check).
        assert mgr.transaction_called is True
        assert mgr.last_tenant_id == tenant_id
        # The pipeline was constructed with the
        # entity + relationship services and the
        # transaction context's session.
        assert "entity_service" in captured["kwargs"]
        assert "relationship_service" in captured["kwargs"]
        # The pipeline was called with the right
        # ids.
        assert captured["tenant_id"] == tenant_id
        assert captured["document_id"] == document_id
        # The result dict is the worker's
        # outward contract.
        assert result["document_id"] == str(document_id)
        assert result["tenant_id"] == str(tenant_id)
        assert "entities_count" in result
        assert "relationships_count" in result
        assert "metrics" in result
