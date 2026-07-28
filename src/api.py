"""
Central API router for the Cortex application.

Mounts every bounded context's REST router plus the WebSocket
endpoint. The route prefixes are aligned with ``Docs/database.md``
and the public API surface described in ``cortex-prd.md``:

* ``/api/v1/auth``            — identity
* ``/api/v1/tenants``         — tenant self-service
* ``/api/v1/users``           — user/role management
* ``/api/v1/api-keys``        — API-key CRUD
* ``/api/v1/documents``       — document upload / list / status
* ``/api/v1/search``          — hybrid retrieval
* ``/api/v1/conversations``   — chat thread CRUD
* ``/api/v1/tenants/me/usage`` — billing / usage
* ``/ws/conversations/{id}``  — streaming WebSocket

The health/metrics router is mounted directly on the app in
``main.py`` because those endpoints live at the root, not under
``/api/v1``.
"""

from __future__ import annotations

from fastapi import APIRouter

from src.billing.interface.rest.routes import (
    admin_router as billing_admin_router,
    router as billing_router,
)
from src.conversation.interface.rest.routes import router as conversation_router
from src.conversation.interface.websocket.routes import router as conversation_ws_router
from src.identity.interface.rest.routes import router as identity_router
from src.ingestion.interface.rest.routes import router as ingestion_router
from src.observability.interface.rest.audit_routes import (
    router as audit_router,
)
from src.observability.interface.rest.routes import router as observability_router
from src.retrieval.interface.rest.routes import router as retrieval_router

api_router = APIRouter()
api_router.include_router(identity_router)
api_router.include_router(observability_router)
api_router.include_router(ingestion_router)
api_router.include_router(retrieval_router)
api_router.include_router(conversation_router)
# V4 Phase 15 — audit log (admin / owner only).
api_router.include_router(audit_router)
# V4: billing — usage events / cost-per-tenant. The
# router's own prefix is ``/tenants``, so the full
# paths end up at ``/api/v1/tenants/me/usage`` and
# ``/api/v1/tenants/me/usage/events`` as documented in
# the PRD. The admin router exposes the broader
# ``/api/v1/usage/events`` endpoint for owner/admin.
api_router.include_router(billing_router)
api_router.include_router(billing_admin_router)

# WebSocket router is mounted at the top level (not under
# ``/api/v1``) because WebSocket endpoints typically don't sit
# behind a versioned API prefix.
ws_router = conversation_ws_router


__all__ = ["api_router", "ws_router"]
