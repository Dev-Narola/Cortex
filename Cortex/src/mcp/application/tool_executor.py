"""
MCP Tool Execution Engine for executing Cortex tools on behalf of external AI clients.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy.orm import Session

from src.mcp.application.tool_registry import MCPToolRegistry
from src.mcp.domain.exceptions import ToolExecutionDenied
from src.shared.exceptions import ValidationException

logger = logging.getLogger(__name__)


class ToolExecutionEngine:
    """Engine executing registered tools against underlying Cortex application services."""

    def __init__(
        self,
        db: Session,
        tool_registry: MCPToolRegistry | None = None,
    ) -> None:
        self._db = db
        self._registry = tool_registry or MCPToolRegistry()

    async def execute_tool(
        self,
        *,
        tenant_id: uuid.UUID,
        user_id: uuid.UUID,
        user_role: str = "member",
        tool_name: str,
        arguments: dict[str, Any],
    ) -> dict[str, Any]:
        """Validate input arguments, check permissions, execute tool, and return result."""
        tool_def = self._registry.get(tool_name)

        if user_role not in tool_def.required_roles and "member" not in tool_def.required_roles:
            raise ToolExecutionDenied(
                message=f"Role '{user_role}' is not authorized to execute tool '{tool_name}'",
                data={"tool_name": tool_name, "user_role": user_role},
            )

        # Validate required arguments
        required = tool_def.input_schema.get("required", [])
        for req in required:
            if req not in arguments or arguments[req] is None:
                raise ValidationException(
                    message=f"Missing required argument '{req}' for tool '{tool_name}'",
                    code=400,
                    data={"tool_name": tool_name, "field": req},
                )

        logger.info(
            "mcp.tool_execution_started",
            extra={"tool_name": tool_name, "tenant_id": str(tenant_id), "user_id": str(user_id)},
        )

        try:
            if tool_name == "retrieve_context":
                return await self._execute_retrieve_context(tenant_id, arguments)
            elif tool_name in ("search_documents", "search_knowledge_base"):
                return await self._execute_search_documents(tenant_id, arguments)
            elif tool_name == "ask_knowledge_base":
                return await self._execute_ask(tenant_id, user_id, arguments)
            elif tool_name == "get_document":
                return self._execute_get_document(tenant_id, arguments)
            elif tool_name == "graph_search":
                return self._execute_graph_search(tenant_id, arguments)
            elif tool_name == "run_agent":
                return await self._execute_run_agent(tenant_id, user_id, arguments)
            elif tool_name == "list_documents":
                return self._execute_list_documents(tenant_id, arguments)
            elif tool_name == "upload_document":
                return await self._execute_upload_document(tenant_id, user_id, arguments)
            elif tool_name == "query_memory":
                return self._execute_query_memory(tenant_id, arguments)
            else:
                raise ToolExecutionDenied(message=f"Handler for tool '{tool_name}' is not implemented")
        except Exception as exc:
            logger.error("mcp.tool_execution_failed", extra={"tool_name": tool_name, "error": str(exc)})
            raise

    async def _execute_retrieve_context(self, tenant_id: uuid.UUID, args: dict[str, Any]) -> dict[str, Any]:
        from src.core.dependencies import get_graph_retrieval_service

        svc = get_graph_retrieval_service(self._db)
        res = await svc.retrieve(
            tenant_id=tenant_id,
            query=args["query"],
            limit=args.get("limit", 5),
        )
        return {
            "content": [
                {
                    "type": "text",
                    "text": res.get("context_text", ""),
                }
            ],
            "graph_facts": res.get("graph_facts", []),
        }

    async def _execute_search_documents(self, tenant_id: uuid.UUID, args: dict[str, Any]) -> dict[str, Any]:
        """Hybrid search + rerank, tenant-scoped, with chunk-level citations."""
        from src.core.database import AsyncSessionLocal
        from src.observability.application.billable import recorder_for_session
        from src.retrieval.interface.dependencies import build_hybrid_search_service

        limit = max(1, min(int(args.get("limit", 5)), 20))
        async with AsyncSessionLocal() as async_db:
            svc = build_hybrid_search_service(async_db, billable=recorder_for_session(self._db))
            results = await svc.search(tenant_id=tenant_id, query=args["query"])
        self._db.commit()  # usage events
        return {
            "items": [
                {
                    "document_id": str(r.document_id),
                    "chunk_id": str(r.chunk_id),
                    "document_title": r.document_title,
                    "chunk_index": r.chunk_index,
                    "content": r.content,
                    "score": r.rerank_score or r.score,
                }
                for r in results[:limit]
            ]
        }

    async def _execute_ask(
        self, tenant_id: uuid.UUID, user_id: uuid.UUID | None, args: dict[str, Any]
    ) -> dict[str, Any]:
        """Grounded answer with citations (stateless: no conversation history)."""
        from src.core.database import AsyncSessionLocal
        from src.core.dependencies import build_answer_query_service

        tokens: list[str] = []
        citations: list[dict[str, Any]] = []
        async with AsyncSessionLocal() as async_db:
            service = build_answer_query_service(async_db, self._db)
            async for event in service.stream_answer(
                tenant_id=tenant_id,
                # A fresh id matches no stored conversation, so history is empty.
                conversation_id=uuid.uuid4(),
                user_id=user_id or uuid.uuid4(),
                query=args["question"],
            ):
                if event.get("kind") == "token":
                    tokens.append(event["content"])
                elif event.get("kind") == "citation":
                    citations.append(event["citation"].to_dict())
        return {
            "content": [{"type": "text", "text": "".join(tokens)}],
            "citations": citations,
        }

    def _execute_get_document(self, tenant_id: uuid.UUID, args: dict[str, Any]) -> dict[str, Any]:
        """One document's metadata and chunk text; another tenant's id reads as not found."""
        from sqlalchemy import select

        from src.ingestion.infrastructure.models import DocumentChunkModel, DocumentModel

        doc = self._db.get(DocumentModel, uuid.UUID(str(args["document_id"])))
        if doc is None or doc.tenant_id != tenant_id:
            raise ValidationException(
                message="Document not found.", code=404, data={"document_id": str(args["document_id"])}
            )
        chunks = self._db.execute(
            select(DocumentChunkModel.chunk_index, DocumentChunkModel.content)
            .where(
                DocumentChunkModel.document_id == doc.id,
                DocumentChunkModel.tenant_id == tenant_id,
            )
            .order_by(DocumentChunkModel.chunk_index)
            .limit(int(args.get("max_chunks", 50)))
        ).all()
        return {
            "document": {
                "id": str(doc.id),
                "title": doc.title,
                "status": doc.status,
                "mime_type": doc.mime_type,
                "created_at": doc.created_at.isoformat() if doc.created_at else None,
            },
            "chunks": [{"chunk_index": i, "content": c} for i, c in chunks],
        }

    def _execute_graph_search(self, tenant_id: uuid.UUID, args: dict[str, Any]) -> dict[str, Any]:
        from src.knowledge_graph.application.query.traversal import GraphSearchService

        svc = GraphSearchService(self._db)
        res = svc.search_graph(tenant_id=tenant_id, query=args["query"])
        entities = [
            {"id": str(e.id), "name": e.name, "entity_type": str(getattr(e.entity_type, "value", e.entity_type))}
            for e in res.get("entities", [])
        ]
        rels = [
            {"id": str(r.id), "type": str(getattr(r.relationship_type, "value", r.relationship_type))}
            for r in res.get("relationships", [])
        ]
        return {"entities": entities, "relationships": rels}

    async def _execute_run_agent(self, tenant_id: uuid.UUID, user_id: uuid.UUID, args: dict[str, Any]) -> dict[str, Any]:
        from src.core.dependencies import get_agent_executor

        agent_id = uuid.UUID(args["agent_id"])
        executor = get_agent_executor(self._db)
        res = await executor.execute_async(
            tenant_id=tenant_id,
            agent_id=agent_id,
            user_id=user_id,
            message=args["message"],
        )
        return {
            "run_id": str(res.run.id),
            "finished": res.finished,
            "output": res.run.output,
            "stop_reason": res.stop_reason,
        }

    def _execute_list_documents(self, tenant_id: uuid.UUID, args: dict[str, Any]) -> dict[str, Any]:
        from src.ingestion.infrastructure.models import DocumentModel

        docs = (
            self._db.query(DocumentModel)
            .filter(DocumentModel.tenant_id == tenant_id)
            .offset(args.get("offset", 0))
            .limit(args.get("limit", 20))
            .all()
        )
        items = [{"id": str(d.id), "title": d.title, "status": d.status} for d in docs]
        return {"documents": items}

    async def _execute_upload_document(
        self, tenant_id: uuid.UUID, user_id: uuid.UUID | None, args: dict[str, Any]
    ) -> dict[str, Any]:
        """Ingest text through the same pipeline as REST uploads."""
        import io

        from src.ingestion.application.services import CreateDocumentService
        from src.ingestion.infrastructure.repositories import DocumentRepository
        from src.ingestion.interface.rest.queue import arq_queue
        from src.ingestion.interface.rest.routes import get_s3_storage

        if user_id is None:
            raise ToolExecutionDenied(message="upload_document needs an attributable user")
        service = CreateDocumentService(DocumentRepository(self._db), get_s3_storage(), queue=arq_queue)
        doc = await service.execute(
            tenant_id=tenant_id,
            created_by=user_id,
            filename=f"{args['title']}.txt",
            mime_type="text/plain",
            file_obj=io.BytesIO(str(args["content"]).encode("utf-8")),
        )
        self._db.commit()
        return {"document_id": str(doc.id), "title": doc.title, "status": str(doc.status)}

    def _execute_query_memory(self, tenant_id: uuid.UUID, args: dict[str, Any]) -> dict[str, Any]:
        from src.execution.infrastructure.repositories import ExecutionRepository

        run_id = uuid.UUID(args["run_id"])
        repo = ExecutionRepository(self._db)
        run = repo.get_run(tenant_id=tenant_id, run_id=run_id)
        if run is None:
            return {"steps": [], "output": ""}
        steps = [{"step_index": i, "content": getattr(s, "content", "")} for i, s in enumerate(run.steps)]
        return {"run_id": str(run.id), "output": run.output, "steps": steps}


__all__ = ["ToolExecutionEngine"]
