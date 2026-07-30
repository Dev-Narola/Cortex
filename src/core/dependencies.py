"""
Shared FastAPI dependencies.

Every cross-cutting auth/tenant context dependency lives here. Route
handlers across every bounded context import these, so a single
change to how the current user is resolved applies everywhere.

Two authentication modes are supported:

* JWT bearer token (interactive users) — `get_current_user`
* API key header (programmatic clients) — `require_api_key`

Each dependency raises a 401/403 with a structured error body
(via the shared exception types) when the caller is missing
or unauthorized.

Implementation note: the identity-specific imports are done lazily
inside each function. Doing them at module top level creates a
circular import (platform -> identity -> platform), because the
identity models depend on `src.core.database`, which itself
triggers a load of `src.core.__init__` and therefore of this
module.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import TYPE_CHECKING

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from src.core.config import settings
from src.core.database import SessionLocal, get_async_db, get_db  # noqa: F401 — re-exported
from src.core.redis_client import get_redis as _get_redis_client
from src.shared.exceptions import (
    UnauthorizedException,
)

if TYPE_CHECKING:  # pragma: no cover - typing only
    from src.identity.domain.entities import ApiKey, Tenant


# ---------------------------------------------------------------------------
# DB / settings providers
# ---------------------------------------------------------------------------


def get_settings():
    """Dependency to get application settings."""
    return settings


def get_redis():
    """Backwards-compat dependency for the shared Redis client."""
    return _get_redis_client()


# `get_db` is imported from `src.core.database` at the top of this
# module so the same callable is what `Depends(get_db)` references
# everywhere — including tests that override it via
# `app.dependency_overrides[get_db]`.
get_db_dependency = get_db


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise UnauthorizedException(
            message="Missing Authorization header.",
            code=401,
            data={"field": "Authorization"},
        )
    parts = authorization.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise UnauthorizedException(
            message="Authorization header must be of the form 'Bearer <token>'.",
            code=401,
            data={"field": "Authorization"},
        )
    return parts[1].strip()


@dataclass(frozen=True)
class ApiKeyContext:
    """Returned by `require_api_key` so route handlers can
    inspect the matched key (e.g. for scope checks)."""

    tenant: Tenant
    api_key: ApiKey


# ---------------------------------------------------------------------------
# Current user / tenant
# ---------------------------------------------------------------------------


def _resolve_jwt_user(token: str, db: Session):
    """Decode a JWT, then load the (user, tenant) it points at."""
    from src.identity.infrastructure.repositories import (
        TenantRepository,
        UserRepository,
    )
    from src.identity.infrastructure.security import decode_access_token

    claims = decode_access_token(token, expected_type="access")
    try:
        user_id = uuid.UUID(str(claims["sub"]))
        tenant_id = uuid.UUID(str(claims["tenant_id"]))
    except (KeyError, ValueError) as exc:
        raise UnauthorizedException(
            message="Token is missing required claims.",
            code=401,
            data={"field": "token"},
        ) from exc

    users = UserRepository(db)
    tenants = TenantRepository(db)
    user = users.find_by_id(user_id, tenant_id=tenant_id)
    tenant = tenants.find_by_id(tenant_id)
    if user is None or tenant is None:
        raise UnauthorizedException(
            message="Authenticated user or tenant no longer exists.",
            code=401,
        )
    if not user.is_active or not tenant.is_active:
        raise UnauthorizedException(
            message="Account is inactive.",
            code=401,
        )
    return user, tenant


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    """Resolve the current `(user, tenant)` from a JWT bearer token."""
    from src.identity.domain.entities import Tenant, User  # noqa: F401

    token = _bearer_token(authorization)
    return _resolve_jwt_user(token, db)


def get_current_tenant(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    """Return just the current tenant. Use this in endpoints that
    need tenant context but don't operate on a specific user."""
    _, tenant = get_current_user(authorization=authorization, db=db)
    return tenant


# ---------------------------------------------------------------------------
# Role-based dependencies
# ---------------------------------------------------------------------------


def _role_check(
    current,
    *,
    min_role,
):
    """Common role check used by the require_* dependencies below.

    Defined as a plain helper (not a FastAPI dependency) so the
    individual `require_*` deps stay first-class citizens that
    FastAPI can wire into route signatures.
    """
    user, tenant = current
    if not user.role.can_act_as(min_role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": (f"This action requires at least the '{min_role.value}' role."),
                "code": 403,
                "data": {
                    "field": "role",
                    "required": min_role.value,
                    "actual": user.role.value,
                },
            },
        )
    return user, tenant


def require_owner(current=Depends(get_current_user)):
    """Allow only the OWNER role."""
    from src.identity.domain.entities import Role

    return _role_check(current, min_role=Role.OWNER)


def require_admin(current=Depends(get_current_user)):
    """Allow OWNER or ADMIN."""
    from src.identity.domain.entities import Role

    return _role_check(current, min_role=Role.ADMIN)


def require_member(current=Depends(get_current_user)):
    """Allow OWNER, ADMIN, or MEMBER (i.e. anyone but VIEWER)."""
    from src.identity.domain.entities import Role

    return _role_check(current, min_role=Role.MEMBER)


def get_answer_query_service(db: Session = Depends(get_db)):
    """
    Sync factory for ``AnswerQueryService`` — V2-era, used by
    legacy callers. New V3 code should depend on
    ``get_answer_query_service_async`` instead so the entire
    pipeline (DB + search + LLM) runs in a single async
    event loop without crossing the sync/async boundary.
    """
    from src.conversation.application.services import AnswerQueryService
    from src.conversation.infrastructure.llm.openai import OpenAIProvider
    from src.embedding.infrastructure.providers.openai import OpenAIEmbeddingProvider
    from src.retrieval.application.fusion import ReciprocalRankFusion
    from src.retrieval.application.query_embedding import QueryEmbeddingService
    from src.retrieval.application.rerank_service import RerankerService
    from src.retrieval.application.search_service import HybridSearchService
    from src.retrieval.infrastructure.full_text_search import FullTextSearchRepository
    from src.retrieval.infrastructure.reranker import IdentityReranker
    from src.retrieval.infrastructure.vector_search import VectorSearchRepository

    llm = OpenAIProvider(api_key=settings.OPENAI_API_KEY)
    embed = QueryEmbeddingService(provider=OpenAIEmbeddingProvider())
    search = HybridSearchService(
        query_embed_service=embed,
        vector_repo=VectorSearchRepository(db),
        fts_repo=FullTextSearchRepository(db),
        reranker=RerankerService(provider=IdentityReranker()),
        fusion=ReciprocalRankFusion(),
    )
    return AnswerQueryService(llm_provider=llm, search_service=search, db=db)


async def get_answer_query_service_async(db: AsyncSession = Depends(get_async_db)):
    """
    Async factory for ``AnswerQueryService`` — V3's primary
    RAG service constructor. Used by the WebSocket route and
    any future async REST endpoint.
    """
    from src.conversation.application.services import AnswerQueryService
    from src.conversation.infrastructure.llm.openai import OpenAIProvider
    from src.embedding.infrastructure.providers.openai import OpenAIEmbeddingProvider
    from src.retrieval.application.fusion import ReciprocalRankFusion
    from src.retrieval.application.query_embedding import QueryEmbeddingService
    from src.retrieval.application.rerank_service import RerankerService
    from src.retrieval.application.search_service import HybridSearchService
    from src.retrieval.infrastructure.full_text_search import FullTextSearchRepository
    from src.retrieval.infrastructure.reranker import IdentityReranker
    from src.retrieval.infrastructure.vector_search import VectorSearchRepository

    llm = OpenAIProvider(api_key=settings.OPENAI_API_KEY)
    embed = QueryEmbeddingService(provider=OpenAIEmbeddingProvider())
    search = HybridSearchService(
        query_embed_service=embed,
        vector_repo=VectorSearchRepository(db),
        fts_repo=FullTextSearchRepository(db),
        reranker=RerankerService(provider=IdentityReranker()),
        fusion=ReciprocalRankFusion(),
    )
    return AnswerQueryService(llm_provider=llm, search_service=search, db=db)


def require_api_key(
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> ApiKeyContext:
    """
    Authenticate via an API key.

    The key may be supplied via either the `X-API-Key` header or a
    `Bearer`-style `Authorization` header. Verification walks every
    API key in the (already-known) tenant and bcrypt-checks each
    one — there is no hash-based lookup, because bcrypt is not
    searchable. The walking cost is acceptable for a typical
    tenant (a handful of keys); for a tenant with thousands of
    keys, this should be replaced with a constant-time indexed
    scheme (e.g. a short SHA-256 fingerprint stored alongside the
    bcrypt hash).
    """
    from src.identity.infrastructure.repositories import (
        ApiKeyRepository,
        TenantRepository,
    )
    from src.identity.infrastructure.security import verify_api_key

    raw = x_api_key
    if not raw and authorization:
        parts = authorization.split(None, 1)
        if len(parts) == 2 and parts[0].lower() == "bearer":
            raw = parts[1].strip()
    if not raw:
        raise UnauthorizedException(
            message="API key is required (X-API-Key or Authorization: Bearer).",
            code=401,
            data={"field": "api_key"},
        )

    tenants = TenantRepository(db)
    api_keys = ApiKeyRepository(db)
    # Walk every tenant's active keys. A future optimization is to
    # store a short, non-secret fingerprint of the key alongside
    # the bcrypt hash so we can look up the tenant in O(1).
    tenant_list = tenants.list(limit=10_000, offset=0)
    for tenant in tenant_list:
        if not tenant.is_active:
            continue
        keys = api_keys.list(tenant.id, include_revoked=False, limit=10_000)
        for key in keys:
            if verify_api_key(raw, key.key_hash):
                key.record_usage()
                db.commit()
                return ApiKeyContext(tenant=tenant, api_key=key)
    raise UnauthorizedException(
        message="Invalid API key.",
        code=401,
        data={"field": "api_key"},
    )


__all__ = [
    "ApiKeyContext",
    "get_agent_executor",
    "get_answer_query_service",
    "get_answer_query_service_async",
    "get_async_db",
    "get_current_tenant",
    "get_current_user",
    "get_db",
    "get_db_dependency",
    "get_rate_limiter",
    "get_redis",
    "get_settings",
    "get_tool_registry",
    "require_admin",
    "require_api_key",
    "require_member",
    "require_owner",
]


# ---------------------------------------------------------------------------
# V6 — Agentic layer factories
# ---------------------------------------------------------------------------
#
# These factories are added in V6 to wire the new bounded
# contexts (agents, tools, execution, limits) into the
# FastAPI dependency-injection system. They follow the
# same pattern as the V3 conversation factories
# (e.g. ``get_answer_query_service``) and are intentionally
# thin: the actual orchestration lives in the application
# services and the executor, both of which are constructed
# here from the request-scoped database session.
#
# The ``ToolRegistry`` and ``LLMProvider`` are *process-scoped*
# (one per app boot, not one per request), so they are
# created on first access and cached. This is what lets a
# built-in tool like ``KnowledgeSearchTool`` be registered
# exactly once at startup and reused for every request.
_tool_registry_singleton = None
_llm_provider_singleton = None
_rate_limiter_singleton = None


def get_tool_registry() -> "ToolRegistry":
    """Return the process-wide tool registry.

    The registry is a single object shared by every
    request, so built-in tools (e.g. ``KnowledgeSearchTool``)
    are registered once at app boot and reused for every
    tenant. Tests can call :func:`reset_singletons` to
    clear the cache between cases.
    """
    global _tool_registry_singleton
    if _tool_registry_singleton is None:
        from src.tools.application.registry import ToolRegistry

        _tool_registry_singleton = ToolRegistry()
    return _tool_registry_singleton


def get_llm_provider() -> "LLMProvider":
    """Return the process-wide LLM provider.

    Defaults to the OpenAI adapter; the settings object
    carries the model name + API key. The provider is
    constructed lazily so tests can swap it out via
    :func:`reset_singletons` before importing the routes.
    """
    global _llm_provider_singleton
    if _llm_provider_singleton is None:
        from src.agents.infrastructure.llm_provider import OpenAILLMProvider

        _llm_provider_singleton = OpenAILLMProvider()
    return _llm_provider_singleton


def get_rate_limiter() -> "RateLimiter":
    """Return the process-wide rate limiter, or ``None`` if Redis is unavailable.

    The rate limiter is optional — when Redis is
    unreachable (e.g. dev mode without a Redis
    container) the agent executor still runs, with
    rate limiting silently disabled. Production must
    wire the limiter; the readiness probe
    (``/health/ready``) returns 503 when Redis is
    unreachable, so the rate limiter is unreachable
    in lockstep.
    """
    global _rate_limiter_singleton
    if _rate_limiter_singleton is not None:
        return _rate_limiter_singleton
    try:
        redis = _get_redis_client()
        from src.limits.application.service import RateLimiter

        _rate_limiter_singleton = RateLimiter(redis)
    except Exception:  # noqa: BLE001 - rate limiter is optional; rate limit can be disabled
        _rate_limiter_singleton = None
    return _rate_limiter_singleton


def get_agent_executor(
    db: Session = Depends(get_db),
) -> "AgentExecutor":
    """Construct an :class:`AgentExecutor` for the current request.

    The executor owns the database session, the LLM
    provider, the tool registry, and the rate limiter.
    Constructing it on every request is cheap — the
    process-scoped collaborators (LLM, registry,
    rate limiter) are singletons.

    V7: The ``GraphRetrievalService`` is also injected
    so that agent runs receive Knowledge Graph context
    prepended to the user message.
    """
    from src.agents.application.executor import AgentExecutor

    # Best-effort graph retrieval — if the import or
    # construction fails, the agent still works without
    # graph augmentation.
    graph_retrieval = None
    try:
        graph_retrieval = get_graph_retrieval_service(db)
    except Exception:  # noqa: BLE001
        pass

    return AgentExecutor(
        db,
        llm=get_llm_provider(),
        registry=get_tool_registry(),
        rate_limiter=get_rate_limiter(),
        graph_retrieval=graph_retrieval,
    )


def reset_singletons() -> None:
    """Drop the process-scoped singletons. Test-only helper."""
    global _tool_registry_singleton, _llm_provider_singleton, _rate_limiter_singleton
    _tool_registry_singleton = None
    _llm_provider_singleton = None
    _rate_limiter_singleton = None


# ---------------------------------------------------------------------------
# V7 — Knowledge Graph dependency factories
# ---------------------------------------------------------------------------


def get_graph_database_client(db: Session = Depends(get_db)):
    """Construct a PostgresGraphDatabaseClient for the current DB session."""
    from src.knowledge_graph.infrastructure.graph_database import PostgresGraphDatabaseClient

    return PostgresGraphDatabaseClient(db)


def get_graph_entity_repository(db: Session = Depends(get_db)):
    """Construct a GraphEntityRepository for the current DB session."""
    from src.knowledge_graph.infrastructure.repositories import GraphEntityRepository

    return GraphEntityRepository(db)


def get_graph_relationship_repository(db: Session = Depends(get_db)):
    """Construct a GraphRelationshipRepository for the current DB session."""
    from src.knowledge_graph.infrastructure.repositories import GraphRelationshipRepository

    return GraphRelationshipRepository(db)


def get_entity_extraction_service():
    """Construct an EntityExtractionService."""
    from src.knowledge_graph.application.extraction import (
        EntityExtractionService,
        OpenAIExtractionProvider,
    )

    provider = OpenAIExtractionProvider(get_llm_provider())
    return EntityExtractionService(provider)


def get_relationship_extraction_service():
    """Construct a RelationshipExtractionService."""
    from src.knowledge_graph.application.extraction import (
        OpenAIExtractionProvider,
        RelationshipExtractionService,
    )

    provider = OpenAIExtractionProvider(get_llm_provider())
    return RelationshipExtractionService(provider)


def get_graph_extraction_pipeline(db: Session = Depends(get_db)):
    """Construct a GraphExtractionPipeline for the current request."""
    from src.knowledge_graph.application.extraction import GraphExtractionPipeline

    return GraphExtractionPipeline(
        db=db,
        entity_service=get_entity_extraction_service(),
        relationship_service=get_relationship_extraction_service(),
    )


def get_graph_traversal_service(db: Session = Depends(get_db)):
    """Construct a GraphTraversalService for the current request."""
    from src.knowledge_graph.application.traversal import GraphTraversalService

    return GraphTraversalService(db)


def get_graph_search_service(db: Session = Depends(get_db)):
    """Construct a GraphSearchService for the current request."""
    from src.knowledge_graph.application.traversal import GraphSearchService

    return GraphSearchService(db)


def get_graph_retrieval_service(db: Session = Depends(get_db)):
    """Construct a GraphRetrievalService for the current request."""
    from src.graph_retrieval.application.services import GraphRetrievalService

    return GraphRetrievalService(
        db=db,
        graph_search_service=get_graph_search_service(db),
        graph_traversal_service=get_graph_traversal_service(db),
    )


# ---------------------------------------------------------------------------
# V8 — MCP Server dependency factories
# ---------------------------------------------------------------------------

_mcp_tool_registry_singleton = None
_mcp_resource_registry_singleton = None
_mcp_prompt_registry_singleton = None


def get_mcp_tool_registry() -> "MCPToolRegistry":
    """Return the process-wide MCP tool registry."""
    global _mcp_tool_registry_singleton
    if _mcp_tool_registry_singleton is None:
        from src.mcp.application.tool_registry import MCPToolRegistry

        _mcp_tool_registry_singleton = MCPToolRegistry()
    return _mcp_tool_registry_singleton


def get_mcp_resource_registry() -> "ResourceRegistry":
    """Return the process-wide MCP resource registry."""
    global _mcp_resource_registry_singleton
    if _mcp_resource_registry_singleton is None:
        from src.mcp.application.resource_registry import ResourceRegistry

        _mcp_resource_registry_singleton = ResourceRegistry()
    return _mcp_resource_registry_singleton


def get_mcp_prompt_registry() -> "PromptRegistry":
    """Return the process-wide MCP prompt registry."""
    global _mcp_prompt_registry_singleton
    if _mcp_prompt_registry_singleton is None:
        from src.mcp.application.prompt_registry import PromptRegistry

        _mcp_prompt_registry_singleton = PromptRegistry()
    return _mcp_prompt_registry_singleton


def get_mcp_session_service(db: Session = Depends(get_db)):
    """Construct an MCPSessionService for the current request."""
    from src.mcp.application.session import MCPSessionService

    return MCPSessionService(db)


def get_mcp_message_router(
    db: Session = Depends(get_db),
) -> "MCPMessageRouter":
    """Construct an MCPMessageRouter for the current request.

    The router is request-scoped because it holds the DB session
    and tenant context. The registries it uses are process-scoped
    singletons.
    """
    from src.mcp.application.message_router import MCPMessageRouter

    return MCPMessageRouter(db)


