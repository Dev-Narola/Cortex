"""
Repository for the tools bounded context.

Mirrors the structure of
:mod:`src.agents.infrastructure.repositories`. Every read
and write is tenant-scoped; the only operation that does
not take ``tenant_id`` explicitly is the *handler* lookup,
which is in-process and tenant-agnostic.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from src.shared.exceptions import ConflictException
from src.tools.domain.entities import Tool, ToolStatus
from src.tools.infrastructure.models import ToolModel


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def _model_to_entity(model: ToolModel) -> Tool:
    return Tool.from_persistence(
        id=model.id,
        tenant_id=model.tenant_id,
        name=model.name,
        description=model.description,
        input_schema=model.schema_ or {},
        handler=model.handler,
        status=model.status,
        permissions=model.permissions,
        created_at=_as_utc(model.created_at),
        updated_at=_as_utc(model.updated_at),
    )


def _entity_to_model(tool: Tool) -> ToolModel:
    return ToolModel(
        id=tool.id,
        tenant_id=tool.tenant_id,
        name=tool.name,
        description=tool.description,
        schema_=tool.input_schema,
        handler=tool.handler,
        status=tool.status.value,
        permissions=list(tool.permissions) if tool.permissions is not None else None,
        created_at=tool.created_at,
        updated_at=tool.updated_at,
    )


class ToolRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def create(self, tool: Tool) -> Tool:
        model = _entity_to_model(tool)
        try:
            self._db.add(model)
            self._db.flush()
        except Exception as exc:  # noqa: BLE001
            self._db.rollback()
            if "uq_tools_tenant_id_name" in str(exc) or "UNIQUE" in str(exc).upper():
                raise ConflictException(
                    message="tool name already exists for this tenant",
                    code=409,
                    data={
                        "field": "name",
                        "tenant_id": str(tool.tenant_id),
                        "name": tool.name,
                    },
                ) from exc
            raise
        return _model_to_entity(model)

    def get(
        self, *, tenant_id: uuid.UUID, tool_id: uuid.UUID
    ) -> Tool | None:
        stmt = select(ToolModel).where(
            ToolModel.id == tool_id,
            ToolModel.tenant_id == tenant_id,
        )
        model = self._db.execute(stmt).scalar_one_or_none()
        return _model_to_entity(model) if model else None

    def get_by_name(self, *, tenant_id: uuid.UUID, name: str) -> Tool | None:
        stmt = select(ToolModel).where(
            ToolModel.tenant_id == tenant_id,
            ToolModel.name == name,
        )
        model = self._db.execute(stmt).scalar_one_or_none()
        return _model_to_entity(model) if model else None

    def list(
        self,
        *,
        tenant_id: uuid.UUID,
        status: ToolStatus | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> Sequence[Tool]:
        stmt = (
            select(ToolModel)
            .where(ToolModel.tenant_id == tenant_id)
            .order_by(ToolModel.name.asc())
            .limit(limit)
            .offset(max(offset, 0))
        )
        if status is not None:
            stmt = stmt.where(ToolModel.status == status.value)
        models = self._db.execute(stmt).scalars().all()
        return [_model_to_entity(m) for m in models]

    def delete(self, *, tenant_id: uuid.UUID, tool_id: uuid.UUID) -> bool:
        # Hard delete: a tool that has been retired is
        # removed outright. The agent run history references
        # tool *names* in its ``steps`` column, not the tool
        # ``id``, so removing a tool does not break the
        # history (the LLM's transcript of "called search
        # tool with X" still reads cleanly).
        stmt = (
            update(ToolModel)
            .where(
                ToolModel.id == tool_id,
                ToolModel.tenant_id == tenant_id,
            )
            .values(status=ToolStatus.DISABLED.value, updated_at=datetime.now(UTC))
        )
        result = self._db.execute(stmt)
        self._db.flush()
        return result.rowcount > 0


__all__ = ["ToolRepository"]
