"""
Resource Providers bridging MCP resource URIs with Cortex application services.
"""

from __future__ import annotations

import json
import re
import uuid
from typing import Any

from sqlalchemy.orm import Session

from src.mcp.domain.exceptions import ResourceAccessDenied


class KnowledgeResourceProvider:
    """Provider serving document content resources."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def read_document(self, tenant_id: uuid.UUID, doc_id: uuid.UUID) -> dict[str, Any]:
        from src.ingestion.infrastructure.models import DocumentModel, DocumentChunkModel

        doc = (
            self._db.query(DocumentModel)
            .filter(DocumentModel.tenant_id == tenant_id, DocumentModel.id == doc_id)
            .first()
        )
        if doc is None:
            raise ResourceAccessDenied(message=f"Document '{doc_id}' not found", data={"doc_id": str(doc_id)})

        chunks = (
            self._db.query(DocumentChunkModel)
            .filter(DocumentChunkModel.tenant_id == tenant_id, DocumentChunkModel.document_id == doc_id)
            .order_by(DocumentChunkModel.chunk_index.asc())
            .all()
        )

        content_text = "\n\n".join([c.content for c in chunks])
        return {
            "uri": f"cortex://knowledge/document/{doc_id}",
            "mimeType": "application/json",
            "text": json.dumps({"id": str(doc.id), "title": doc.title, "content": content_text}),
        }


class GraphResourceProvider:
    """Provider serving Knowledge Graph entity and path resources."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def read_entity(self, tenant_id: uuid.UUID, entity_id: uuid.UUID) -> dict[str, Any]:
        from src.knowledge_graph.infrastructure.repositories import GraphEntityRepository

        repo = GraphEntityRepository(self._db)
        entity = repo.get(tenant_id=tenant_id, entity_id=entity_id)
        if entity is None:
            raise ResourceAccessDenied(message=f"Entity '{entity_id}' not found")

        return {
            "uri": f"cortex://graph/entity/{entity_id}",
            "mimeType": "application/json",
            "text": json.dumps(
                {
                    "id": str(entity.id),
                    "name": entity.name,
                    "type": str(getattr(entity.entity_type, "value", entity.entity_type)),
                    "description": entity.description,
                }
            ),
        }

    def read_path(self, tenant_id: uuid.UUID, entity_id: uuid.UUID) -> dict[str, Any]:
        from src.knowledge_graph.application.traversal import GraphTraversalService

        svc = GraphTraversalService(self._db)
        neighbors = svc.find_neighbors(tenant_id=tenant_id, entity_id=entity_id, limit=20)
        return {
            "uri": f"cortex://graph/path/{entity_id}",
            "mimeType": "application/json",
            "text": json.dumps(
                {
                    "entity_id": str(entity_id),
                    "neighbors": [{"id": str(n.id), "name": n.name} for n in neighbors],
                }
            ),
        }


class MemoryResourceProvider:
    """Provider serving Agent execution memory resources."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def read_memory(self, tenant_id: uuid.UUID, run_id: uuid.UUID) -> dict[str, Any]:
        from src.execution.infrastructure.repositories import ExecutionRepository

        repo = ExecutionRepository(self._db)
        run = repo.get_run(tenant_id=tenant_id, run_id=run_id)
        if run is None:
            raise ResourceAccessDenied(message=f"Run '{run_id}' not found")

        return {
            "uri": f"cortex://memory/{run_id}",
            "mimeType": "application/json",
            "text": json.dumps(
                {
                    "run_id": str(run.id),
                    "agent_id": str(run.agent_id),
                    "input": run.input,
                    "output": run.output,
                    "status": str(run.status),
                }
            ),
        }


class SettingsProvider:
    """Provider serving tenant configuration settings resources."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def read_settings(self, tenant_id: uuid.UUID) -> dict[str, Any]:
        from src.identity.infrastructure.models import TenantModel

        tenant = self._db.query(TenantModel).filter(TenantModel.id == tenant_id).first()
        if tenant is None:
            raise ResourceAccessDenied(message="Tenant not found")

        return {
            "uri": "cortex://tenant/settings",
            "mimeType": "application/json",
            "text": json.dumps({"tenant_id": str(tenant.id), "name": tenant.name, "plan": tenant.plan}),
        }


class MCPResourceDispatcher:
    """Dispatcher routing resource URIs to individual resource providers."""

    def __init__(self, db: Session) -> None:
        self._db = db
        self._knowledge_provider = KnowledgeResourceProvider(db)
        self._graph_provider = GraphResourceProvider(db)
        self._memory_provider = MemoryResourceProvider(db)
        self._settings_provider = SettingsProvider(db)

    def read_resource(self, tenant_id: uuid.UUID, uri: str) -> dict[str, Any]:
        if uri == "cortex://tenant/settings":
            return self._settings_provider.read_settings(tenant_id)

        m = re.match(r"^cortex://knowledge/document/([0-9a-f\-]{36})$", uri, re.I)
        if m:
            return self._knowledge_provider.read_document(tenant_id, uuid.UUID(m.group(1)))

        m = re.match(r"^cortex://graph/entity/([0-9a-f\-]{36})$", uri, re.I)
        if m:
            return self._graph_provider.read_entity(tenant_id, uuid.UUID(m.group(1)))

        m = re.match(r"^cortex://graph/path/([0-9a-f\-]{36})$", uri, re.I)
        if m:
            return self._graph_provider.read_path(tenant_id, uuid.UUID(m.group(1)))

        m = re.match(r"^cortex://memory/([0-9a-f\-]{36})$", uri, re.I)
        if m:
            return self._memory_provider.read_memory(tenant_id, uuid.UUID(m.group(1)))

        raise ResourceAccessDenied(message=f"Invalid or unsupported resource URI '{uri}'", data={"uri": uri})


__all__ = [
    "GraphResourceProvider",
    "KnowledgeResourceProvider",
    "MCPResourceDispatcher",
    "MemoryResourceProvider",
    "SettingsProvider",
]
