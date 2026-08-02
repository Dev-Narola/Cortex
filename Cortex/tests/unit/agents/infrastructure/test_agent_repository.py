"""
Repository tests for the ``AgentRepository``.

The repository is the only place that enforces
"every query is tenant-scoped" at the SQL layer. These
tests assert that:

* create persists the agent and returns it,
* duplicate names within a tenant raise 409,
* get / list / update / delete refuse to cross tenant
  boundaries,
* soft delete hides the agent from default reads,
* activate / deactivate are reversible.
"""

from __future__ import annotations

import uuid

import pytest

from src.agents.domain.entities import Agent, AgentStatus
from src.agents.infrastructure.repositories import AgentRepository
from src.shared.exceptions import ConflictException


def test_create_persists_agent(db_session, tenant_id):
    repo = AgentRepository(db_session)
    agent = Agent.create(
        tenant_id=tenant_id, name="A1", system_prompt="p", model="gpt-4o-mini"
    )
    persisted = repo.create(agent)
    db_session.commit()
    assert persisted.id == agent.id
    fetched = repo.get(tenant_id=tenant_id, agent_id=persisted.id)
    assert fetched is not None
    assert fetched.name == "A1"


def test_duplicate_name_raises_409(db_session, tenant_id):
    repo = AgentRepository(db_session)
    a1 = Agent.create(
        tenant_id=tenant_id, name="dup", system_prompt="p", model="m"
    )
    repo.create(a1)
    db_session.commit()
    a2 = Agent.create(
        tenant_id=tenant_id, name="dup", system_prompt="q", model="m"
    )
    with pytest.raises(ConflictException):
        repo.create(a2)


def test_get_does_not_cross_tenants(
    db_session, tenant_id, second_tenant_id
):
    repo = AgentRepository(db_session)
    a = Agent.create(
        tenant_id=tenant_id, name="A1", system_prompt="p", model="m"
    )
    repo.create(a)
    db_session.commit()
    # Same id, different tenant -> not visible
    assert repo.get(tenant_id=second_tenant_id, agent_id=a.id) is None


def test_list_scoped_to_tenant(db_session, tenant_id, second_tenant_id):
    repo = AgentRepository(db_session)
    for name in ["A1", "A2"]:
        repo.create(
            Agent.create(
                tenant_id=tenant_id, name=name, system_prompt="p", model="m"
            )
        )
    repo.create(
        Agent.create(
            tenant_id=second_tenant_id, name="B1", system_prompt="p", model="m"
        )
    )
    db_session.commit()
    own = repo.list(tenant_id=tenant_id)
    other = repo.list(tenant_id=second_tenant_id)
    assert sorted(a.name for a in own) == ["A1", "A2"]
    assert [a.name for a in other] == ["B1"]


def test_update_persists_changes(db_session, tenant_id):
    repo = AgentRepository(db_session)
    a = Agent.create(
        tenant_id=tenant_id, name="A1", system_prompt="p", model="m"
    )
    repo.create(a)
    db_session.commit()
    updated = a.with_changes(name="A1 renamed", description="d")
    repo.update(updated)
    db_session.commit()
    fetched = repo.get(tenant_id=tenant_id, agent_id=a.id)
    assert fetched.name == "A1 renamed"
    assert fetched.description == "d"


def test_soft_delete_hides_by_default(db_session, tenant_id):
    repo = AgentRepository(db_session)
    a = Agent.create(
        tenant_id=tenant_id, name="A1", system_prompt="p", model="m"
    )
    repo.create(a)
    db_session.commit()
    assert repo.delete(tenant_id=tenant_id, agent_id=a.id) is True
    db_session.commit()
    assert repo.get(tenant_id=tenant_id, agent_id=a.id) is None
    assert (
        repo.get(
            tenant_id=tenant_id, agent_id=a.id, include_archived=True
        )
        is not None
    )


def test_activate_deactivate_round_trip(db_session, tenant_id):
    repo = AgentRepository(db_session)
    a = Agent.create(
        tenant_id=tenant_id, name="A1", system_prompt="p", model="m"
    )
    repo.create(a)
    db_session.commit()
    assert repo.deactivate(tenant_id=tenant_id, agent_id=a.id) is True
    db_session.commit()
    assert (
        repo.get(tenant_id=tenant_id, agent_id=a.id).status
        is AgentStatus.INACTIVE
    )
    assert repo.activate(tenant_id=tenant_id, agent_id=a.id) is True
    db_session.commit()
    assert (
        repo.get(tenant_id=tenant_id, agent_id=a.id).status
        is AgentStatus.ACTIVE
    )


def test_cannot_activate_archived(db_session, tenant_id):
    repo = AgentRepository(db_session)
    a = Agent.create(
        tenant_id=tenant_id, name="A1", system_prompt="p", model="m"
    )
    repo.create(a)
    db_session.commit()
    repo.delete(tenant_id=tenant_id, agent_id=a.id)  # archives
    db_session.commit()
    # Attempting to reactivate an archived agent is a
    # no-op (the WHERE clause excludes ARCHIVED).
    assert repo.activate(tenant_id=tenant_id, agent_id=a.id) is False
    assert repo.deactivate(tenant_id=tenant_id, agent_id=a.id) is False


def test_count_reflects_filters(db_session, tenant_id, second_tenant_id):
    repo = AgentRepository(db_session)
    for i in range(3):
        repo.create(
            Agent.create(
                tenant_id=tenant_id,
                name=f"A{i}",
                system_prompt="p",
                model="m",
            )
        )
    repo.create(
        Agent.create(
            tenant_id=second_tenant_id, name="B1", system_prompt="p", model="m"
        )
    )
    db_session.commit()
    assert repo.count(tenant_id=tenant_id) == 3
    assert repo.count(tenant_id=second_tenant_id) == 1
    assert repo.count(tenant_id=tenant_id, status=AgentStatus.ACTIVE) == 3


# Tenant A cannot access tenant B's agents — the security
# guarantee that the rest of the project depends on. This
# test is the explicit acceptance test for that invariant.
def test_tenant_a_cannot_access_tenant_b_agents(
    db_session, tenant_id, second_tenant_id
):
    repo = AgentRepository(db_session)
    a = Agent.create(
        tenant_id=tenant_id, name="A-secret", system_prompt="p", model="m"
    )
    repo.create(a)
    db_session.commit()
    # Reading with the wrong tenant id returns None —
    # it does not raise, because a 404 (not found) is
    # the right response when a resource is invisible
    # to the caller.
    assert (
        repo.get(tenant_id=second_tenant_id, agent_id=a.id) is None
    )
    # Listing returns only the requesting tenant's
    # agents.
    assert all(
        a.tenant_id == second_tenant_id
        for a in repo.list(tenant_id=second_tenant_id)
    )
    # Delete with the wrong tenant id returns False
    # (no-op) rather than succeeding.
    assert (
        repo.delete(tenant_id=second_tenant_id, agent_id=a.id) is False
    )
    # The agent is still there for the rightful owner.
    assert (
        repo.get(tenant_id=tenant_id, agent_id=a.id) is not None
    )
