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
            elif tool_name == "search_documents":
                return await self._execute_search_documents(tenant_id, arguments)
            elif tool_name == "graph_search":
                return self._execute_graph_search(tenant_id, arguments)
            elif tool_name == "run_agent":
                return await self._execute_run_agent(tenant_id, user_id, arguments)
            elif tool_name == "list_documents":
                return self._execute_list_documents(tenant_id, arguments)
            elif tool_name == "upload_document":
                return await self._execute_upload_document(tenant_id, arguments)
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
        from src.retrieval.application.search_service import HybridSearchService

        svc = HybridSearchService(self._db)
        results = await svc.search(
            tenant_id=tenant_id,
            query=args["query"],
            top_k=args.get("limit", 5),
        )
        items = []
        for r in results:
            items.append({
                "content": getattr(r, "content", getattr(r, "text", str(r))),
                "score": getattr(r, "score", 1.0),
            })
        return {"items": items}

    def _execute_graph_search(self, tenant_id: uuid.UUID, args: dict[str, Any]) -> dict[str, Any]:
        from src.knowledge_graph.application.traversal import GraphSearchService

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

    async def _execute_upload_document(self, tenant_id: uuid.UUID, args: dict[str, Any]) -> dict[str, Any]:
        from src.ingestion.application.services import DocumentIngestionService
        from src.ingestion.domain.entities import DocumentInput

        doc_input = DocumentInput(
            title=args["title"],
            filename=f"{args['title']}.txt",
            content_type="text/plain",
            content=args["content"].encode("utf-8"),
        )
        svc = DocumentIngestionService(self._db)
        doc = await svc.ingest_document(tenant_id=tenant_id, input_data=doc_input)
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
