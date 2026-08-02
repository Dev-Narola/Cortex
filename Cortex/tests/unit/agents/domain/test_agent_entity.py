"""
Unit tests for the :class:`Agent` domain entity.

These tests exercise the validation rules in
:meth:`Agent.create` and the lifecycle transitions in
:meth:`Agent.activate`, :meth:`Agent.deactivate`,
:meth:`Agent.archive`. The test database is not
required for the entity layer — everything runs in
pure Python.
"""

from __future__ import annotations

import uuid

import pytest

from src.agents.domain.entities import Agent, AgentStatus
from src.agents.domain.value_objects import AgentConfiguration
from src.shared.exceptions import ValidationException


def test_create_minimal_agent_defaults_to_active(uuid4):
    agent = Agent.create(
        tenant_id=uuid4,
        name="Acme Helper",
        system_prompt="You are helpful.",
        model="gpt-4o-mini",
    )
    assert agent.status is AgentStatus.ACTIVE
    assert agent.configuration.max_iterations == 10
    assert agent.name == "Acme Helper"
    assert agent.system_prompt == "You are helpful."
    assert agent.model == "gpt-4o-mini"
    assert agent.created_at == agent.updated_at


def test_create_rejects_blank_name(uuid4):
    with pytest.raises(ValidationException) as exc_info:
        Agent.create(
            tenant_id=uuid4,
            name="   ",
            system_prompt="x",
            model="gpt-4o-mini",
        )
    assert exc_info.value.data["field"] == "name"


def test_create_rejects_blank_system_prompt(uuid4):
    with pytest.raises(ValidationException) as exc_info:
        Agent.create(
            tenant_id=uuid4,
            name="x",
            system_prompt="",
            model="gpt-4o-mini",
        )
    assert exc_info.value.data["field"] == "system_prompt"


def test_create_rejects_blank_model(uuid4):
    with pytest.raises(ValidationException):
        Agent.create(tenant_id=uuid4, name="x", system_prompt="x", model=" ")


def test_create_rejects_non_uuid_tenant_id():
    with pytest.raises(ValidationException):
        Agent.create(
            tenant_id="not-a-uuid",  # type: ignore[arg-type]
            name="x",
            system_prompt="x",
            model="m",
        )


def test_lifecycle_transitions(uuid4):
    agent = Agent.create(
        tenant_id=uuid4,
        name="x",
        system_prompt="x",
        model="m",
    )
    assert agent.status is AgentStatus.ACTIVE

    paused = agent.deactivate()
    assert paused.status is AgentStatus.INACTIVE

    active = paused.activate()
    assert active.status is AgentStatus.ACTIVE

    archived = active.archive()
    assert archived.status is AgentStatus.ARCHIVED
    assert archived.status.is_terminal


def test_archived_agent_cannot_be_reactivated(uuid4):
    agent = Agent.create(
        tenant_id=uuid4, name="x", system_prompt="x", model="m"
    ).archive()
    with pytest.raises(ValidationException):
        agent.activate()


def test_archived_agent_cannot_execute(uuid4):
    agent = Agent.create(
        tenant_id=uuid4, name="x", system_prompt="x", model="m"
    ).archive()
    with pytest.raises(Exception) as exc_info:
        agent.ensure_runnable()
    # ``AgentInactive`` is the domain exception
    assert exc_info.value.code == 409


def test_with_changes_rejects_empty_name(uuid4):
    agent = Agent.create(
        tenant_id=uuid4, name="x", system_prompt="x", model="m"
    )
    with pytest.raises(ValidationException):
        agent.with_changes(name="  ")


def test_serialization_round_trip(uuid4):
    agent = Agent.create(
        tenant_id=uuid4,
        name="x",
        system_prompt="x",
        model="m",
        configuration=AgentConfiguration(
            max_iterations=5, temperature=0.7, max_tokens=2048
        ),
    )
    d = agent.configuration.to_dict()
    cfg = AgentConfiguration.from_dict(d)
    assert cfg == agent.configuration
    # The deserialised configuration enforces the
    # same rules as the original.
    assert cfg.max_iterations == 5
    assert cfg.temperature == 0.7


def test_config_value_object_validates_constraints():
    with pytest.raises(Exception):
        AgentConfiguration(max_iterations=0)
    with pytest.raises(Exception):
        AgentConfiguration(temperature=2.5)
    with pytest.raises(Exception):
        AgentConfiguration(max_tokens=0)


def test_config_permits_tool_logic():
    # None = all tools allowed
    cfg = AgentConfiguration(allowed_tools=None)
    assert cfg.permits_tool("search")
    # Explicit allow-list
    cfg2 = AgentConfiguration(allowed_tools=frozenset({"search"}))
    assert cfg2.permits_tool("search")
    assert not cfg2.permits_tool("calculator")


@pytest.fixture
def uuid4():
    return uuid.uuid4()
