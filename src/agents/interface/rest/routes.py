"""
REST routes for the agents bounded context.

The routes mount at ``/agents`` under the versioned
``/api/v1`` prefix, matching the pattern in
:mod:`src.identity.interface.rest.routes`. The shape of
the request/response bodies is defined inline with
Pydantic v2 models; the models live in this file so the
route surface and the contract are in one place.

Six endpoints:

* ``POST   /agents``                — create a new agent
* ``GET    /agents``                — list the tenant's agents
* ``GET    /agents/{id}``           — fetch a single agent
* ``PATCH  /agents/{id}``           — partial update
* ``DELETE /agents/{id}``           — soft delete
* ``POST   /agents/{id}/execute``   — run the agent once

The :class:`AgentExecutor` is injected via FastAPI's DI
system; the wiring is in
:mod:`src.core.dependencies`.
"""

from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, ConfigDict, Field

from src.agents.application.executor import AgentExecutor
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
from src.agents.domain.value_objects import AgentConfiguration
from src.core.dependencies import get_agent_executor, get_current_user, get_db
from src.identity.domain.entities import User
from sqlalchemy.orm import Session


# ---------------------------------------------------------------------------
# Pydantic request/response models
# ---------------------------------------------------------------------------


class AgentConfigurationPayload(BaseModel):
    """The wire shape of :class:`AgentConfiguration`."""

    model_config = ConfigDict(extra="forbid")

    max_iterations: int = Field(10, ge=1, le=100)
    temperature: float = Field(0.2, ge=0.0, le=2.0)
    max_tokens: int = Field(1024, ge=1, le=32_000)
    allowed_tools: list[str] | None = None
    memory_enabled: bool = False


class CreateAgentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, max_length=255)
    description: str = Field("", max_length=2000)
    system_prompt: str = Field(..., min_length=1)
    model: str = Field(..., min_length=1, max_length=255)
    configuration: AgentConfigurationPayload | None = None


class UpdateAgentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = Field(None, max_length=2000)
    system_prompt: str | None = Field(None, min_length=1)
    model: str | None = Field(None, min_length=1, max_length=255)
    configuration: AgentConfigurationPayload | None = None


class AgentResponse(BaseModel):
    """The wire shape of an :class:`Agent`."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    description: str
    system_prompt: str
    model: str
    status: AgentStatus
    configuration: AgentConfigurationPayload
    created_at: Any
    updated_at: Any


class AgentListResponse(BaseModel):
    items: list[AgentResponse]
    total: int
    limit: int
    offset: int


class ExecuteAgentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(..., min_length=1, max_length=16_384)


class ExecuteAgentResponse(BaseModel):
    run_id: uuid.UUID
    status: str
    result: str = ""
    iterations: int = 0
    tool_calls: int = 0
    stop_reason: str | None = None


# ---------------------------------------------------------------------------
# Mapping helpers
# ---------------------------------------------------------------------------


def _agent_to_response(agent: Agent) -> AgentResponse:
    return AgentResponse(
        id=agent.id,
        tenant_id=agent.tenant_id,
        name=agent.name,
        description=agent.description,
        system_prompt=agent.system_prompt,
        model=agent.model,
        status=agent.status,
        configuration=AgentConfigurationPayload(
            max_iterations=agent.configuration.max_iterations,
            temperature=agent.configuration.temperature,
            max_tokens=agent.configuration.max_tokens,
            allowed_tools=(
                sorted(agent.configuration.allowed_tools)
                if agent.configuration.allowed_tools is not None
                else None
            ),
            memory_enabled=agent.configuration.memory_enabled,
        ),
        created_at=agent.created_at,
        updated_at=agent.updated_at,
    )


def _payload_to_value_object(
    payload: AgentConfigurationPayload | None,
) -> AgentConfiguration:
    if payload is None:
        return AgentConfiguration()
    return AgentConfiguration(
        max_iterations=payload.max_iterations,
        temperature=payload.temperature,
        max_tokens=payload.max_tokens,
        allowed_tools=(
            frozenset(payload.allowed_tools) if payload.allowed_tools is not None else None
        ),
        memory_enabled=payload.memory_enabled,
    )


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/agents", tags=["agents"])


@router.post(
    "",
    response_model=AgentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an agent",
)
def create_agent(
    request: CreateAgentRequest,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[tuple, Depends(get_current_user)],
) -> AgentResponse:
    user, tenant = current
    service = CreateAgentService(db)
    agent = service.execute(
        CreateAgentInput(
            tenant_id=tenant.id,
            name=request.name,
            system_prompt=request.system_prompt,
            model=request.model,
            description=request.description,
            configuration=_payload_to_value_object(request.configuration),
        )
    )
    return _agent_to_response(agent)


@router.get(
    "",
    response_model=AgentListResponse,
    summary="List the tenant's agents",
)
def list_agents(
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[tuple, Depends(get_current_user)],
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    status_filter: AgentStatus | None = Query(None, alias="status"),
) -> AgentListResponse:
    user, tenant = current
    service = ListAgentsService(db)
    items, total = service.execute(
        tenant_id=tenant.id, limit=limit, offset=offset, status=status_filter
    )
    return AgentListResponse(
        items=[_agent_to_response(a) for a in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/{agent_id}",
    response_model=AgentResponse,
    summary="Get a single agent",
)
def get_agent(
    agent_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[tuple, Depends(get_current_user)],
) -> AgentResponse:
    user, tenant = current
    service = GetAgentService(db)
    agent = service.execute(tenant_id=tenant.id, agent_id=agent_id)
    return _agent_to_response(agent)


@router.patch(
    "/{agent_id}",
    response_model=AgentResponse,
    summary="Partially update an agent",
)
def update_agent(
    agent_id: uuid.UUID,
    request: UpdateAgentRequest,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[tuple, Depends(get_current_user)],
) -> AgentResponse:
    user, tenant = current
    service = UpdateAgentService(db)
    agent = service.execute(
        UpdateAgentInput(
            tenant_id=tenant.id,
            agent_id=agent_id,
            name=request.name,
            description=request.description,
            system_prompt=request.system_prompt,
            model=request.model,
            configuration=_payload_to_value_object(request.configuration),
        )
    )
    return _agent_to_response(agent)


@router.delete(
    "/{agent_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soft-delete an agent",
)
def delete_agent(
    agent_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[tuple, Depends(get_current_user)],
) -> None:
    user, tenant = current
    service = DeleteAgentService(db)
    service.execute(DeleteAgentInput(tenant_id=tenant.id, agent_id=agent_id))
    return None


@router.post(
    "/{agent_id}/execute",
    response_model=ExecuteAgentResponse,
    summary="Run the agent once",
)
async def execute_agent(
    agent_id: uuid.UUID,
    request: ExecuteAgentRequest,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[tuple, Depends(get_current_user)],
    executor: Annotated[AgentExecutor, Depends(get_agent_executor)],
) -> ExecuteAgentResponse:
    user, tenant = current
    result = await executor.execute_async(
        tenant_id=tenant.id,
        agent_id=agent_id,
        user_id=user.id,
        message=request.message,
    )
    return ExecuteAgentResponse(
        run_id=result.run.id,
        status=result.run.status.value,
        result=result.run.output,
        iterations=len(result.run.steps),
        tool_calls=sum(len(s.tool_calls) for s in result.run.steps),
        stop_reason=result.stop_reason,
    )


__all__ = ["router"]
