"""
Tests for the F5 Part 3 ``GetAgentRunService`` and the
``flatten_run_tool_calls`` / ``serialise_run`` helpers.

The flattener is the *single* source of truth for how the
agent's in-memory ``AgentRun`` shape becomes the
UI-ready tool-call list. The route layer just calls
``serialise_run``; the tests below lock the flattening
contract so a future change can't silently break the
frontend's trace UI.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest

from src.agents.application.services import (
    FlattenedToolCall,
    GetAgentRunService,
    _ms_between,
    _pick_final_answer_step,
    _summarise_tool_result,
    flatten_run_tool_calls,
    serialise_run,
)
from src.execution.domain.entities import AgentRun, AgentRunStatus, AgentStep


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _step(
    *,
    iteration: int,
    tool_calls: tuple[dict, ...] = (),
    output: str = "",
    error: str | None = None,
    started_at: datetime | None = None,
    completed_at: datetime | None = None,
) -> AgentStep:
    """Build a fully-populated :class:`AgentStep` for tests."""
    return AgentStep(
        iteration=iteration,
        output=output,
        tool_calls=tool_calls,
        error=error,
        started_at=started_at or datetime(2026, 8, 11, 10, 0, 0, tzinfo=UTC),
        completed_at=completed_at,
    )


def _run(*, steps: tuple[AgentStep, ...]) -> AgentRun:
    """Build an :class:`AgentRun` with a deterministic id."""
    started_at = steps[0].started_at if steps else datetime.now(UTC)
    completed_at = (
        steps[-1].completed_at if steps and steps[-1].completed_at else None
    )
    return AgentRun(
        id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        agent_id=uuid.UUID("00000000-0000-0000-0000-000000000002"),
        tenant_id=uuid.UUID("00000000-0000-0000-0000-000000000003"),
        user_id=uuid.UUID("00000000-0000-0000-0000-000000000004"),
        input="how are these related?",
        output="final answer",
        status=AgentRunStatus.COMPLETED,
        steps=steps,
        started_at=started_at,
        completed_at=completed_at,
        total_tokens=42,
    )


# ---------------------------------------------------------------------------
# _ms_between
# ---------------------------------------------------------------------------


class TestMsBetween:
    def test_returns_zero_for_same_instant(self) -> None:
        now = datetime(2026, 1, 1, tzinfo=UTC)
        assert _ms_between(now, now) == 0

    def test_returns_int_milliseconds(self) -> None:
        start = datetime(2026, 1, 1, tzinfo=UTC)
        end = start + timedelta(milliseconds=420)
        assert _ms_between(start, end) == 420

    def test_returns_none_when_end_missing(self) -> None:
        start = datetime(2026, 1, 1, tzinfo=UTC)
        assert _ms_between(start, None) is None

    def test_handles_naive_datetimes_as_utc(self) -> None:
        # Defensive: tests may construct naive datetimes. They
        # should be treated as UTC so the subtraction is
        # meaningful.
        start = datetime(2026, 1, 1)  # naive
        end = datetime(2026, 1, 1, 0, 0, 1)  # naive, +1s
        assert _ms_between(start, end) == 1000

    def test_clamps_negative_delta_to_zero(self) -> None:
        # Should not happen in practice (clock skew between
        # ``started_at`` and ``completed_at`` is always
        # forward), but be defensive.
        start = datetime(2026, 1, 1, 0, 0, 1, tzinfo=UTC)
        end = datetime(2026, 1, 1, 0, 0, 0, tzinfo=UTC)
        assert _ms_between(start, end) == 0


# ---------------------------------------------------------------------------
# _summarise_tool_result
# ---------------------------------------------------------------------------


class TestSummariseToolResult:
    def test_string_result_truncated(self) -> None:
        text = "x" * 200
        summary, status, err = _summarise_tool_result(text, max_chars=80)
        assert summary == "x" * 80
        assert status == "ok"
        assert err is None

    def test_string_result_stripped(self) -> None:
        summary, status, _ = _summarise_tool_result("   hello   ", max_chars=80)
        assert summary == "hello"
        assert status == "ok"

    def test_empty_string_replaced_with_placeholder(self) -> None:
        summary, status, _ = _summarise_tool_result("", max_chars=80)
        assert summary == "(no output)"
        assert status == "ok"

    def test_error_dict_marked_as_error(self) -> None:
        summary, status, err = _summarise_tool_result(
            {"error": "boom"}, max_chars=80
        )
        assert summary == "Tool failed"
        assert status == "error"
        assert err == "boom"

    def test_items_list_counted(self) -> None:
        summary, status, _ = _summarise_tool_result(
            {"items": [{"a": 1}, {"b": 2}]}, max_chars=80
        )
        assert "2 items" in summary
        assert status == "ok"

    def test_chunks_key_handled(self) -> None:
        summary, _, _ = _summarise_tool_result({"chunks": [{}, {}, {}]})
        assert summary == "3 chunks"

    def test_entities_key_handled(self) -> None:
        summary, _, _ = _summarise_tool_result({"entities": [{}, {}]})
        assert summary == "2 entities"

    def test_summary_key_preferred(self) -> None:
        summary, _, _ = _summarise_tool_result(
            {"summary": "Concise answer"}
        )
        assert summary == "Concise answer"

    def test_list_result_counted(self) -> None:
        summary, _, _ = _summarise_tool_result([1, 2, 3, 4])
        assert "4 items" in summary

    def test_none_replaced_with_placeholder(self) -> None:
        summary, _, _ = _summarise_tool_result(None)
        assert summary == "(no output)"


# ---------------------------------------------------------------------------
# _pick_final_answer_step
# ---------------------------------------------------------------------------


class TestPickFinalAnswerStep:
    def test_returns_last_no_tool_step_with_output(self) -> None:
        steps = (
            _step(iteration=1, tool_calls=({"name": "x"},)),
            _step(iteration=2, output="done"),
        )
        picked = _pick_final_answer_step(steps)
        assert picked is not None
        assert picked.iteration == 2

    def test_returns_error_step(self) -> None:
        steps = (
            _step(iteration=1, error="crashed", output=""),
        )
        picked = _pick_final_answer_step(steps)
        assert picked is not None
        assert picked.error == "crashed"

    def test_returns_none_when_only_tool_steps(self) -> None:
        steps = (
            _step(iteration=1, tool_calls=({"name": "x"},)),
            _step(iteration=2, tool_calls=({"name": "y"},)),
        )
        assert _pick_final_answer_step(steps) is None


# ---------------------------------------------------------------------------
# flatten_run_tool_calls
# ---------------------------------------------------------------------------


class TestFlattenRunToolCalls:
    def test_empty_run_returns_empty_list(self) -> None:
        run = _run(steps=())
        assert flatten_run_tool_calls(run) == []

    def test_flattens_single_tool_call(self) -> None:
        start = datetime(2026, 1, 1, tzinfo=UTC)
        end = start + timedelta(milliseconds=420)
        run = _run(
            steps=(
                _step(
                    iteration=1,
                    tool_calls=(
                        {
                            "id": "call_1",
                            "name": "retrieve_documents",
                            "arguments": {},
                            "result": {"chunks": [{}, {}, {}]},
                        },
                    ),
                    started_at=start,
                    completed_at=end,
                ),
            )
        )
        flat = flatten_run_tool_calls(run)
        assert len(flat) == 1
        assert flat[0].name == "retrieve_documents"
        assert flat[0].latency_ms == 420
        assert flat[0].status == "ok"
        assert "3 chunks" in flat[0].result_summary

    def test_multiple_tool_calls_preserve_order(self) -> None:
        start = datetime(2026, 1, 1, tzinfo=UTC)
        end = start + timedelta(milliseconds=1000)
        run = _run(
            steps=(
                _step(
                    iteration=1,
                    tool_calls=(
                        {"id": "c1", "name": "tool_a", "result": {}},
                        {"id": "c2", "name": "tool_b", "result": {}},
                    ),
                    started_at=start,
                    completed_at=end,
                ),
            )
        )
        flat = flatten_run_tool_calls(run)
        assert [t.name for t in flat] == ["tool_a", "tool_b"]

    def test_appends_synthetic_generate_answer(self) -> None:
        start = datetime(2026, 1, 1, tzinfo=UTC)
        end = start + timedelta(milliseconds=800)
        run = _run(
            steps=(
                _step(
                    iteration=1,
                    tool_calls=(
                        {"id": "c1", "name": "retrieve_documents", "result": {}},
                    ),
                    started_at=start,
                    completed_at=start + timedelta(milliseconds=400),
                ),
                _step(
                    iteration=2,
                    output="The final answer is here.",
                    started_at=start + timedelta(milliseconds=400),
                    completed_at=end,
                ),
            )
        )
        flat = flatten_run_tool_calls(run)
        assert [t.name for t in flat] == [
            "retrieve_documents",
            "generate_answer",
        ]
        # Final-answer step uses the step's own latency.
        assert flat[-1].latency_ms == 400
        assert "The final answer is here." in flat[-1].result_summary

    def test_handles_failed_tool_call(self) -> None:
        start = datetime(2026, 1, 1, tzinfo=UTC)
        end = start + timedelta(milliseconds=100)
        run = _run(
            steps=(
                _step(
                    iteration=1,
                    tool_calls=(
                        {
                            "id": "c1",
                            "name": "search_graph",
                            "result": {"error": "graph offline"},
                        },
                    ),
                    started_at=start,
                    completed_at=end,
                ),
            )
        )
        flat = flatten_run_tool_calls(run)
        assert flat[0].status == "error"
        assert flat[0].error == "graph offline"
        assert flat[0].result_summary == "Tool failed"

    def test_skips_non_dict_tool_call_records(self) -> None:
        # Defensive: a forward-compat tool might write
        # something other than a dict. The flattener must
        # skip rather than crash.
        start = datetime(2026, 1, 1, tzinfo=UTC)
        end = start + timedelta(milliseconds=100)
        run = _run(
            steps=(
                _step(
                    iteration=1,
                    tool_calls=(
                        "not a dict",  # type: ignore[arg-type]
                        {"id": "c1", "name": "tool_a", "result": {}},
                    ),
                    started_at=start,
                    completed_at=end,
                ),
            )
        )
        flat = flatten_run_tool_calls(run)
        assert len(flat) == 1
        assert flat[0].name == "tool_a"

    def test_no_synthetic_final_when_only_tool_steps(self) -> None:
        start = datetime(2026, 1, 1, tzinfo=UTC)
        run = _run(
            steps=(
                _step(
                    iteration=1,
                    tool_calls=({"id": "c1", "name": "tool_a", "result": {}},),
                    started_at=start,
                    completed_at=start + timedelta(milliseconds=100),
                ),
                _step(
                    iteration=2,
                    tool_calls=({"id": "c2", "name": "tool_b", "result": {}},),
                    started_at=start + timedelta(milliseconds=100),
                    completed_at=start + timedelta(milliseconds=200),
                ),
            )
        )
        flat = flatten_run_tool_calls(run)
        names = [t.name for t in flat]
        assert "generate_answer" not in names


# ---------------------------------------------------------------------------
# serialise_run
# ---------------------------------------------------------------------------


class TestSerialiseRun:
    def test_includes_steps_and_flat_tool_calls(self) -> None:
        start = datetime(2026, 1, 1, tzinfo=UTC)
        run = _run(
            steps=(
                _step(
                    iteration=1,
                    tool_calls=(
                        {"id": "c1", "name": "tool_a", "result": {}},
                    ),
                    started_at=start,
                    completed_at=start + timedelta(milliseconds=300),
                ),
                _step(
                    iteration=2,
                    output="done",
                    started_at=start + timedelta(milliseconds=300),
                    completed_at=start + timedelta(milliseconds=400),
                ),
            )
        )
        out = serialise_run(run)
        assert out["iterations"] == 2
        assert out["tool_call_count"] == 1
        assert len(out["steps"]) == 2
        assert len(out["tool_calls"]) == 2  # tool_a + generate_answer
        # Every step carries a latency_ms so the wire shape
        # is fully self-describing.
        assert all("latency_ms" in s for s in out["steps"])


# ---------------------------------------------------------------------------
# GetAgentRunService
# ---------------------------------------------------------------------------


class TestGetAgentRunService:
    def test_returns_run_for_tenant(
        self, db_session, engine  # noqa: ARG002
    ) -> None:
        """Integration smoke test: a real run is found by id.

        The service uses ``ExecutionRepository.get_run`` which
        is already covered in the execution test suite. Here
        we just need to confirm the wrapper wires correctly
        and returns the entity (not None) when the row
        exists.
        """
        from src.execution.infrastructure.repositories import ExecutionRepository
        from src.execution.domain.entities import AgentRun, AgentRunStatus

        run = AgentRun.start(
            agent_id=uuid.uuid4(),
            tenant_id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            input="hello",
        )
        # Persist directly via the repository to keep the
        # test independent of the agent executor wiring.
        persisted = ExecutionRepository(db_session).create_run(run)
        db_session.commit()

        service = GetAgentRunService(db_session)
        found = service.execute(
            tenant_id=persisted.tenant_id, run_id=persisted.id
        )
        assert found.id == persisted.id
        assert found.status == AgentRunStatus.STARTED

    def test_raises_when_run_missing(
        self, db_session, engine  # noqa: ARG002
    ) -> None:
        from src.agents.domain.exceptions import AgentRunNotFound

        service = GetAgentRunService(db_session)
        with pytest.raises(AgentRunNotFound):
            service.execute(
                tenant_id=uuid.uuid4(), run_id=uuid.uuid4()
            )

    def test_raises_for_other_tenants_run(
        self, db_session, engine  # noqa: ARG002
    ) -> None:
        """Tenant isolation: an attacker cannot fetch a run
        that belongs to a different tenant by guessing the
        ``run_id`` — the service surfaces it as
        ``AgentRunNotFound`` (404), not the entity itself.
        """
        from src.agents.domain.exceptions import AgentRunNotFound
        from src.execution.infrastructure.repositories import ExecutionRepository
        from src.execution.domain.entities import AgentRun

        run = AgentRun.start(
            agent_id=uuid.uuid4(),
            tenant_id=uuid.uuid4(),  # tenant A
            user_id=uuid.uuid4(),
            input="hello",
        )
        persisted = ExecutionRepository(db_session).create_run(run)
        db_session.commit()

        service = GetAgentRunService(db_session)
        with pytest.raises(AgentRunNotFound):
            service.execute(
                tenant_id=uuid.uuid4(),  # tenant B
                run_id=persisted.id,
            )


__all__: list[str] = []
