"""
Service-layer tests for the agents bounded context.

The service is the place where two pieces of business
logic come together:

* the domain validation rules (``Agent.create``,
  ``Agent.with_changes``), and
* the repository invariants (tenant scoping, soft
  delete, the unique-name constraint).

These tests are end-to-end for the *service* layer —
they go through the SQLite in-memory database and
assert the right exception types come out of the top
of the service.
"""

from __future__ import annotations

import uuid

import pytest

from src.agents.application.services import (
    CreateAgentInput,
    CreateAgentService,
    DeleteAgentInput,
    DeleteAgentService,
    GetAgentService,
    ListAgentsService,
    UpdateAgentInput,
    UpdateAgentService,
)
from src.agents.domain.entities import Agent, AgentStatus
from src.agents.domain.exceptions import AgentNotFound
from src.shared.exceptions import ConflictException, ValidationException


def test_create_service_persists_agent(db_session, tenant_id):
    service = CreateAgentService(db_session)
    agent = service.execute(
        CreateAgentInput(
            tenant_id=tenant_id,
            name="Acme Helper",
            system_prompt="You are helpful.",
            model="gpt-4o-mini",
        )
    )
    assert agent.name == "Acme Helper"
    assert agent.status is AgentStatus.ACTIVE
    # Persisted — re-read via the get service.
    fetched = GetAgentService(db_session).execute(
        tenant_id=tenant_id, agent_id=agent.id
    )
    assert fetched.id == agent.id


def test_create_service_duplicate_name_raises_409(db_session, tenant_id):
    svc = CreateAgentService(db_session)
    svc.execute(
        CreateAgentInput(
            tenant_id=tenant_id, name="A1", system_prompt="p", model="m"
        )
    )
    with pytest.raises(ConflictException):
        svc.execute(
            CreateAgentInput(
                tenant_id=tenant_id, name="A1", system_prompt="q", model="m"
            )
        )


def test_update_service_partial_update(db_session, tenant_id):
    svc = CreateAgentService(db_session)
    created = svc.execute(
        CreateAgentInput(
            tenant_id=tenant_id, name="A1", system_prompt="p", model="m"
        )
    )
    upd_svc = UpdateAgentService(db_session)
    updated = upd_svc.execute(
        UpdateAgentInput(
            tenant_id=tenant_id,
            agent_id=created.id,
            name="A1 renamed",
            description="now with description",
        )
    )
    assert updated.name == "A1 renamed"
    assert updated.description == "now with description"
    # Untouched fields preserved.
    assert updated.system_prompt == "p"
    assert updated.model == "m"


def test_update_service_rejects_empty_payload(db_session, tenant_id):
    svc = CreateAgentService(db_session)
    created = svc.execute(
        CreateAgentInput(
            tenant_id=tenant_id, name="A1", system_prompt="p", model="m"
        )
    )
    upd_svc = UpdateAgentService(db_session)
    with pytest.raises(ValidationException):
        upd_svc.execute(
            UpdateAgentInput(tenant_id=tenant_id, agent_id=created.id)
        )


def test_update_service_returns_404_for_other_tenant(
    db_session, tenant_id, second_tenant_id
):
    svc = CreateAgentService(db_session)
    created = svc.execute(
        CreateAgentInput(
            tenant_id=tenant_id, name="A1", system_prompt="p", model="m"
        )
    )
    upd_svc = UpdateAgentService(db_session)
    with pytest.raises(AgentNotFound):
        upd_svc.execute(
            UpdateAgentInput(
                tenant_id=second_tenant_id,
                agent_id=created.id,
                name="hijack",
            )
        )


def test_delete_service_soft_deletes(db_session, tenant_id):
    create_svc = CreateAgentService(db_session)
    created = create_svc.execute(
        CreateAgentInput(
            tenant_id=tenant_id, name="A1", system_prompt="p", model="m"
        )
    )
    del_svc = DeleteAgentService(db_session)
    del_svc.execute(DeleteAgentInput(tenant_id=tenant_id, agent_id=created.id))
    # Subsequent get returns 404 (the agent is gone
    # from the API surface, even though the row still
    # exists in the database with a deleted_at).
    with pytest.raises(AgentNotFound):
        GetAgentService(db_session).execute(
            tenant_id=tenant_id, agent_id=created.id
        )


def test_list_service_returns_total(db_session, tenant_id):
    create_svc = CreateAgentService(db_session)
    for i in range(3):
        create_svc.execute(
            CreateAgentInput(
                tenant_id=tenant_id, name=f"A{i}", system_prompt="p", model="m"
            )
        )
    items, total = ListAgentsService(db_session).execute(
        tenant_id=tenant_id, limit=10
    )
    assert total == 3
    assert len(items) == 3


# Security: tenant A cannot delete tenant B's agents.
def test_delete_service_cross_tenant_raises_404(
    db_session, tenant_id, second_tenant_id
):
    create_svc = CreateAgentService(db_session)
    created = create_svc.execute(
        CreateAgentInput(
            tenant_id=tenant_id, name="A1", system_prompt="p", model="m"
        )
    )
    del_svc = DeleteAgentService(db_session)
    with pytest.raises(AgentNotFound):
        del_svc.execute(
            DeleteAgentInput(tenant_id=second_tenant_id, agent_id=created.id)
        )
    # The agent is still there.
    assert (
        GetAgentService(db_session).execute(
            tenant_id=tenant_id, agent_id=created.id
        )
        is not None
    )
