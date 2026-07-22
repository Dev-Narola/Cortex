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
from src.platform.database import get_db
from src.platform.dependencies import (
    get_current_user,
    require_admin,
    require_member,
)

router = APIRouter()


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
def login(body: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """
    Authenticate with `tenant_slug` + `email` + `password` and
    receive a new access + refresh token pair.
    """
    service = AuthenticateUserService(db)
    issued = service.execute(
        tenant_slug=body.tenant_slug,
        email=body.email,
        password=body.password,
    )
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
    current: tuple[User, Tenant] = Depends(require_admin),
    db: Session = Depends(get_db),
) -> TenantResponse:
    _, tenant = current
    service = UpdateTenantService(db)
    updated = service.execute(
        tenant_id=tenant.id,
        name=body.name,
        plan=body.plan,
        settings=body.settings,
    )
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
    current: tuple[User, Tenant] = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ApiKeyCreatedResponse:
    _, tenant = current
    service = CreateApiKeyService(db)
    issued = service.execute(
        tenant_id=tenant.id,
        name=body.name,
        scopes=body.scopes,
    )
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
    api_key_id: uuid.UUID = Path(..., description="ID of the API key to revoke"),
    current: tuple[User, Tenant] = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ApiKeyResponse:
    _, tenant = current
    service = RevokeApiKeyService(db)
    key = service.execute(api_key_id=api_key_id, tenant_id=tenant.id)
    return _api_key_to_response(key)


__all__ = ["router"]
