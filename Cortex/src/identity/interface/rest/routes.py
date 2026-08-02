"""
HTTP interface for the identity bounded context.

All routes here are mounted under `/api/v1` by `src/api.py` and
delegate to the application services in
`src.identity.application.services`. Request/response models are
Pydantic v2 (kept local to this file so the domain layer stays
framework-free).

OpenAPI documentation is generated automatically by FastAPI from the
type hints and Pydantic models; the docstrings below provide the
human-readable summary shown in `/docs`.
"""

from __future__ import annotations

import uuid

from fastapi import (
    APIRouter,
    Depends,
    Path,
    Query,
    Request,
    Response,
    status,
)
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from src.identity.application.services import (
    AuthenticateUserService,
    CreateApiKeyService,
    RegisterTenantService,
    RevokeApiKeyService,
    UpdateProfileService,
    UpdateTenantService,
)
from src.identity.domain.entities import ApiKey, Plan, Role, Tenant, User
from src.core.database import get_db
from src.core.dependencies import (
    get_current_user,
    require_admin,
    require_member,
)

# V4 Phase 15 / Phase 30 — audit event wiring on the
# privileged routes (login, API key create / revoke,
# tenant / user / role changes). The audit log is
# append-only; the audit row is the *only* evidence
# the operator has that an action happened, so the
# call sites catch AuditRecordingError and log a
# critical line (the security gap is signal, not
# silent) but do not re-raise — the underlying
# action has already succeeded.
from src.observability.application.audit_service import (  # noqa: E402
    AuditRecordingError,
    AuditService,
)
from src.observability.domain.entities import AuditAction  # noqa: E402
from src.observability.infrastructure.repositories import (  # noqa: E402
    AuditSqlRepository,
)


router = APIRouter()


def _client_ip(request: Request | None) -> str | None:
    """Best-effort client IP extraction.

    Reads ``X-Forwarded-For`` first (the operator's
    load balancer / ingress is expected to set it),
    then ``request.client.host``. Returns ``None`` if
    neither is available (which the audit row treats
    as "unknown" — never as a 500).
    """
    if request is None:
        return None
    xff = request.headers.get("x-forwarded-for")
    if xff:
        # XFF is a comma-separated list; the first
        # entry is the original client.
        return xff.split(",")[0].strip()
    if request.client is not None:
        return request.client.host
    return None


def _safe_audit(
    db: Session,
    *,
    tenant_id: uuid.UUID,
    action: AuditAction,
    actor_user_id: uuid.UUID | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    metadata: dict | None = None,
    ip_address: str | None = None,
) -> None:
    """Record an audit event, swallowing + logging the failure.

    Used by the route layer. The underlying action
    (login, API key create, tenant update) has
    already succeeded by the time the audit row is
    attempted; we never want to fail the request
    because the audit log write failed. We do want
    to make the gap visible: critical log + a
    counter tick (handled inside ``AuditService``).
    """
    try:
        AuditService(repository=AuditSqlRepository(db)).record(
            tenant_id=tenant_id,
            action=action,
            actor_user_id=actor_user_id,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id else None,
            metadata=metadata or {},
            ip_address=ip_address,
        )
    except AuditRecordingError:
        # The counter + critical log already fired
        # inside AuditService. We intentionally do
        # not raise — the action that was audited
        # has already succeeded and the user should
        # not see a 500 for a logging-side failure.
        pass


# ---------------------------------------------------------------------------
# Pydantic request/response models
# ---------------------------------------------------------------------------


class _Base(BaseModel):
    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)


class RegisterRequest(_Base):
    """Body for `POST /auth/register`."""

    tenant_name: str = Field(..., min_length=1, max_length=255)
    tenant_slug: str = Field(..., min_length=2, max_length=63)
    email: str = Field(..., min_length=3, max_length=320)
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)


class LoginRequest(_Base):
    """Body for `POST /auth/login`."""

    tenant_slug: str = Field(..., min_length=2, max_length=63)
    email: str = Field(..., min_length=3, max_length=320)
    password: str = Field(..., min_length=1, max_length=128)


class RefreshRequest(_Base):
    """Body for `POST /auth/refresh`."""

    refresh_token: str = Field(..., min_length=10)


class UserResponse(_Base):
    id: uuid.UUID
    tenant_id: uuid.UUID
    email: str
    full_name: str | None = None
    role: Role
    is_active: bool
    last_login: str | None = None
    created_at: str


class TenantResponse(_Base):
    id: uuid.UUID
    name: str
    slug: str
    plan: Plan
    is_active: bool
    settings: dict
    created_at: str
    updated_at: str


class TokenResponse(_Base):
    access_token: str
    refresh_token: str
    token_type: str
    expires_in: int
    user: UserResponse
    tenant: TenantResponse


class UpdateProfileRequest(_Base):
    full_name: str | None = Field(default=None, max_length=255)


class UpdateTenantRequest(_Base):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    plan: Plan | None = None
    settings: dict | None = None


class CreateApiKeyRequest(_Base):
    name: str = Field(..., min_length=1, max_length=255)
    scopes: list[str] = Field(default_factory=list)


class ApiKeyResponse(_Base):
    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    scopes: list[str]
    last_used_at: str | None = None
    revoked_at: str | None = None
    created_at: str


class ApiKeyCreatedResponse(ApiKeyResponse):
    """Returned exactly once at creation time — the `raw_key` is
    never recoverable after this response is delivered."""

    raw_key: str


# ---------------------------------------------------------------------------
# Mapping helpers
# ---------------------------------------------------------------------------


def _user_to_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        tenant_id=user.tenant_id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        is_active=user.is_active,
        last_login=user.last_login.isoformat() if user.last_login else None,
        created_at=user.created_at.isoformat(),
    )


def _tenant_to_response(tenant: Tenant) -> TenantResponse:
    return TenantResponse(
        id=tenant.id,
        name=tenant.name,
        slug=tenant.slug,
        plan=tenant.plan,
        is_active=tenant.is_active,
        settings=dict(tenant.settings or {}),
        created_at=tenant.created_at.isoformat(),
        updated_at=tenant.updated_at.isoformat(),
    )


def _api_key_to_response(key: ApiKey) -> ApiKeyResponse:
    return ApiKeyResponse(
        id=key.id,
        tenant_id=key.tenant_id,
        name=key.name,
        scopes=list(key.scopes),
        last_used_at=key.last_used_at.isoformat() if key.last_used_at else None,
        revoked_at=key.revoked_at.isoformat() if key.revoked_at else None,
        created_at=key.created_at.isoformat(),
    )


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------


@router.post(
    "/auth/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new tenant with its owner user",
    responses={
        201: {"description": "Tenant created; tokens issued for the owner"},
        400: {"description": "Validation error"},
        409: {"description": "Tenant slug or owner email already in use"},
    },
)
def register_tenant(
    body: RegisterRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """
    Register a new tenant workspace and the user who owns it. The
    caller becomes the OWNER of the freshly created tenant and is
    immediately issued an access + refresh token pair.
    """
    service = RegisterTenantService(db)
    result = service.execute(
        tenant_name=body.tenant_name,
        tenant_slug=body.tenant_slug,
        owner_email=body.email,
        owner_password=body.password,
        owner_full_name=body.full_name,
    )
    # Now log the new owner in to issue tokens. This re-uses the
    # authenticate service, so password verification is consistent.
    auth = AuthenticateUserService(db)
    issued = auth.execute(
        tenant_slug=result.tenant.slug,
        email=body.email,
        password=body.password,
    )
    # V4 Phase 30 — record the tenant creation. The
    # owner is the actor; the new tenant id is both
    # the resource and the audit tenant scope. Done
    # *after* the service call so a failed write
    # never blocks registration.
    _safe_audit(
        db,
        tenant_id=result.tenant.id,
        action=AuditAction.TENANT_CREATED,
        actor_user_id=issued.user.id,
        resource_type="tenant",
        resource_id=result.tenant.id,
        metadata={"slug": result.tenant.slug, "name": result.tenant.name},
        ip_address=_client_ip(request),
    )
    # The V3 services auto-commit internally, so the
    # tenant + user rows are already persisted. The
    # audit row is appended in the *same* session and
    # needs an explicit commit before the request
    # handler returns; otherwise the row would be
    # rolled back when ``get_db`` closes the session.
    db.commit()
    response.status_code = status.HTTP_201_CREATED
    return TokenResponse(
        access_token=issued.access_token,
        refresh_token=issued.refresh_token,
        token_type=issued.token_type,
        expires_in=issued.expires_in,
        user=_user_to_response(issued.user),
        tenant=_tenant_to_response(issued.tenant),
    )


@router.post(
    "/auth/login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Authenticate and receive a fresh token pair",
    responses={
        200: {"description": "Authentication successful"},
        401: {"description": "Invalid credentials"},
    },
)
def login(
    body: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """
    Authenticate with `tenant_slug` + `email` + `password` and
    receive a new access + refresh token pair.
    """
    service = AuthenticateUserService(db)
    try:
        issued = service.execute(
            tenant_slug=body.tenant_slug,
            email=body.email,
            password=body.password,
        )
    except Exception:
        # V4 Phase 30 — failed login audit. The
        # tenant_slug from the request body is the
        # only tenant context we have; we still try
        # to resolve the tenant id so the audit row
        # is properly tenant-scoped (a failed login
        # is a per-tenant security event, not a
        # global one).
        try:
            from src.identity.infrastructure.repositories import (
                TenantRepository,
            )

            tenant_obj = (
                TenantRepository(db).get_by_slug(body.tenant_slug)
                if body.tenant_slug
                else None
            )
            tenant_id = tenant_obj.id if tenant_obj else uuid.UUID(int=0)
        except Exception:
            # Fall back to a zero UUID; the row is
            # tagged outcome=failed so the operator
            # can filter for it.
            tenant_id = uuid.UUID(int=0)
        _safe_audit(
            db,
            tenant_id=tenant_id,
            action=AuditAction.LOGIN_FAILURE,
            resource_type="session",
            resource_id=None,
            metadata={
                "tenant_slug": body.tenant_slug,
                "email": body.email,
            },
            ip_address=_client_ip(request),
        )
        # Commit so the failure audit row is durable
        # even when the underlying auth error is
        # re-raised to the client.
        db.commit()
        raise
    _safe_audit(
        db,
        tenant_id=issued.tenant.id,
        action=AuditAction.LOGIN_SUCCESS,
        actor_user_id=issued.user.id,
        resource_type="session",
        resource_id=issued.user.id,
        ip_address=_client_ip(request),
    )
    # Commit so the audit row is durable — the
    # ``AuthenticateUserService`` updates ``last_login``
    # but does not commit the audit row.
    db.commit()
    return TokenResponse(
        access_token=issued.access_token,
        refresh_token=issued.refresh_token,
        token_type=issued.token_type,
        expires_in=issued.expires_in,
        user=_user_to_response(issued.user),
        tenant=_tenant_to_response(issued.tenant),
    )


@router.post(
    "/auth/refresh",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Exchange a refresh token for a new token pair",
    responses={
        200: {"description": "Token refreshed"},
        401: {"description": "Refresh token is invalid or expired"},
    },
)
def refresh_token(body: RefreshRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """Trade a still-valid refresh token for a fresh access + refresh pair."""
    service = AuthenticateUserService(db)
    issued = service.refresh(refresh_token=body.refresh_token)
    return TokenResponse(
        access_token=issued.access_token,
        refresh_token=issued.refresh_token,
        token_type=issued.token_type,
        expires_in=issued.expires_in,
        user=_user_to_response(issued.user),
        tenant=_tenant_to_response(issued.tenant),
    )


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------


@router.get(
    "/users/me",
    response_model=UserResponse,
    status_code=status.HTTP_200_OK,
    summary="Get the currently authenticated user",
    responses={
        200: {"description": "The current user"},
        401: {"description": "Not authenticated"},
    },
)
def get_me(
    current: tuple[User, Tenant] = Depends(get_current_user),
) -> UserResponse:
    user, _ = current
    return _user_to_response(user)


@router.patch(
    "/users/me",
    response_model=UserResponse,
    status_code=status.HTTP_200_OK,
    summary="Update the currently authenticated user's profile",
    responses={
        200: {"description": "Updated user"},
        401: {"description": "Not authenticated"},
        404: {"description": "User no longer exists"},
    },
)
def update_me(
    body: UpdateProfileRequest,
    current: tuple[User, Tenant] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserResponse:
    user, _ = current
    service = UpdateProfileService(db)
    updated = service.execute(
        user_id=user.id,
        tenant_id=user.tenant_id,
        full_name=body.full_name,
    )
    return _user_to_response(updated)


# ---------------------------------------------------------------------------
# Tenants
# ---------------------------------------------------------------------------


@router.get(
    "/tenants/me",
    response_model=TenantResponse,
    status_code=status.HTTP_200_OK,
    summary="Get the current tenant",
    responses={
        200: {"description": "The current tenant"},
        401: {"description": "Not authenticated"},
    },
)
def get_my_tenant(
    current: tuple[User, Tenant] = Depends(get_current_user),
) -> TenantResponse:
    _, tenant = current
    return _tenant_to_response(tenant)


@router.patch(
    "/tenants/me",
    response_model=TenantResponse,
    status_code=status.HTTP_200_OK,
    summary="Update the current tenant (name, plan, or settings)",
    responses={
        200: {"description": "Updated tenant"},
        401: {"description": "Not authenticated"},
        403: {"description": "Caller is not owner/admin"},
        404: {"description": "Tenant no longer exists"},
    },
)
def update_my_tenant(
    body: UpdateTenantRequest,
    request: Request,
    current: tuple[User, Tenant] = Depends(require_admin),
    db: Session = Depends(get_db),
) -> TenantResponse:
    user, tenant = current
    service = UpdateTenantService(db)
    updated = service.execute(
        tenant_id=tenant.id,
        name=body.name,
        plan=body.plan,
        settings=body.settings,
    )
    # V4 Phase 30 — tenant changes (name, plan,
    # settings) are audited. The metadata captures
    # only the *fields* that actually changed, not
    # the full new value, so a tenant-wide PII
    # field accidentally placed under ``settings``
    # is not leaked into the audit log.
    changed_fields: list[str] = []
    if body.name is not None and body.name != tenant.name:
        changed_fields.append("name")
    if body.plan is not None and body.plan != tenant.plan:
        changed_fields.append("plan")
    if body.settings is not None:
        changed_fields.append("settings")
    _safe_audit(
        db,
        tenant_id=tenant.id,
        action=AuditAction.TENANT_UPDATED,
        actor_user_id=user.id,
        resource_type="tenant",
        resource_id=tenant.id,
        metadata={"changed_fields": changed_fields},
        ip_address=_client_ip(request),
    )
    # Commit so the audit row is durable.
    db.commit()
    return _tenant_to_response(updated)


# ---------------------------------------------------------------------------
# API keys
# ---------------------------------------------------------------------------


@router.post(
    "/api-keys",
    response_model=ApiKeyCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate a new API key (raw value shown once)",
    responses={
        201: {"description": "API key created; raw value returned exactly once"},
        400: {"description": "Validation error"},
        401: {"description": "Not authenticated"},
        403: {"description": "Caller is not owner/admin"},
    },
)
def create_api_key(
    body: CreateApiKeyRequest,
    request: Request,
    current: tuple[User, Tenant] = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ApiKeyCreatedResponse:
    user, tenant = current
    service = CreateApiKeyService(db)
    issued = service.execute(
        tenant_id=tenant.id,
        name=body.name,
        scopes=body.scopes,
    )
    # V4 Phase 30 — API key creation is a privileged
    # action; the audit row records the actor, the
    # new key id, and the scopes. The raw key is
    # *never* written to the audit log (it's only
    # in the response body, returned once).
    _safe_audit(
        db,
        tenant_id=tenant.id,
        action=AuditAction.API_KEY_CREATED,
        actor_user_id=user.id,
        resource_type="api_key",
        resource_id=issued.api_key.id,
        metadata={"name": body.name, "scopes": list(body.scopes)},
        ip_address=_client_ip(request),
    )
    # Commit so the audit row is durable; the V3
    # ``CreateApiKeyService`` commits the key but
    # not the audit.
    db.commit()
    base = _api_key_to_response(issued.api_key)
    return ApiKeyCreatedResponse(
        **base.model_dump(),
        raw_key=issued.raw_key,
    )


@router.get(
    "/api-keys",
    response_model=list[ApiKeyResponse],
    status_code=status.HTTP_200_OK,
    summary="List the current tenant's API keys",
    responses={
        200: {"description": "List of API keys (hashes never exposed)"},
        401: {"description": "Not authenticated"},
    },
)
def list_api_keys(
    include_revoked: bool = Query(default=False),
    current: tuple[User, Tenant] = Depends(require_member),
    db: Session = Depends(get_db),
) -> list[ApiKeyResponse]:
    from src.identity.infrastructure.repositories import ApiKeyRepository

    _, tenant = current
    repo = ApiKeyRepository(db)
    keys = repo.list(tenant.id, include_revoked=include_revoked, limit=100, offset=0)
    return [_api_key_to_response(k) for k in keys]


@router.delete(
    "/api-keys/{api_key_id}",
    response_model=ApiKeyResponse,
    status_code=status.HTTP_200_OK,
    summary="Revoke an API key",
    responses={
        200: {"description": "API key revoked"},
        401: {"description": "Not authenticated"},
        403: {"description": "Caller is not owner/admin"},
        404: {"description": "API key not found"},
    },
)
def revoke_api_key(
    request: Request,
    api_key_id: uuid.UUID = Path(..., description="ID of the API key to revoke"),
    current: tuple[User, Tenant] = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ApiKeyResponse:
    user, tenant = current
    service = RevokeApiKeyService(db)
    key = service.execute(api_key_id=api_key_id, tenant_id=tenant.id)
    # V4 Phase 30 — API key revocation is a privileged
    # action; the audit row is the only place a
    # future operator can find out who revoked what.
    _safe_audit(
        db,
        tenant_id=tenant.id,
        action=AuditAction.API_KEY_REVOKED,
        actor_user_id=user.id,
        resource_type="api_key",
        resource_id=key.id,
        metadata={"name": key.name},
        ip_address=_client_ip(request),
    )
    # Commit so the audit row is durable.
    db.commit()
    return _api_key_to_response(key)


__all__ = ["router"]
