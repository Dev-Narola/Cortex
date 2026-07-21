"""
Domain entities for the identity bounded context.

This module contains the pure-Python domain model for tenants, users, API
keys, and roles. Per the project's hexagonal layout, no entity in this
file should import from FastAPI, SQLAlchemy, boto3, or any other
infrastructure concern — the rules enforced here must hold in unit tests
exactly as they hold in production.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import ClassVar

from src.shared.exceptions import (
    ConflictException,
    NotFoundException,
    UnauthorizedException,
    ValidationException,
)


# ---------------------------------------------------------------------------
# Value objects
# ---------------------------------------------------------------------------


class Plan(str, Enum):
    """
    Subscription plan that determines a tenant's rate limits and feature
    access. Kept in the domain layer because pricing/plan changes are a
    business decision, not a persistence detail.
    """

    FREE = "free"
    PRO = "pro"
    ENTERPRISE = "enterprise"


class Role(str, Enum):
    """
    Role a user holds inside their tenant. The order is intentional:
    higher index = more privilege, which is useful for hierarchy checks.
    """

    VIEWER = "viewer"
    MEMBER = "member"
    ADMIN = "admin"
    OWNER = "owner"

    def rank(self) -> int:
        return _ROLE_RANK[self]

    def can_act_as(self, other: "Role") -> bool:
        """A user with this role may exercise a permission requiring `other`."""
        return self.rank() >= other.rank()


_ROLE_RANK: dict[Role, int] = {
    Role.VIEWER: 0,
    Role.MEMBER: 1,
    Role.ADMIN: 2,
    Role.OWNER: 3,
}


# ---------------------------------------------------------------------------
# Slug registry (used by Tenant to enforce uniqueness at the domain level)
# ---------------------------------------------------------------------------


# Slugs are URL-safe identifiers used in paths (e.g. /t/acme-corp). The
# constraint is intentionally strict: lowercase, alphanumeric, with single
# hyphens as separators. This is also what the persistence layer's unique
# index will mirror.
_SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

# Class-level registry of slugs that have been issued during this
# process's lifetime. The uniqueness invariant on `slug` is enforced
# here at the domain level so the rule is visible in code and unit
# tests, independent of any database. The persistence layer is still
# expected to back this with a `UNIQUE` index for cross-process
# guarantees.
_used_slugs: set[str] = set()


# ---------------------------------------------------------------------------
# Tenant
# ---------------------------------------------------------------------------


@dataclass(eq=False)
class Tenant:
    """
    Tenant — the root of all tenant-scoped data in Cortex.

    Every other entity in the system (users, documents, conversations,
    agent runs, audit log entries, usage events, knowledge-graph nodes)
    traces back to a single `Tenant` instance, which is what gives the
    system its multi-tenant isolation guarantee.

    Business rules enforced by this entity:

    * `name` cannot be empty (whitespace-only is rejected).
    * `slug` is non-empty, URL-safe, lowercase, and unique within the
      current process.
    * `plan` defaults to `Plan.FREE` when not provided.
    * `is_active` defaults to `True` for a newly created tenant.
    * `created_at` and `updated_at` are timezone-aware UTC; `updated_at`
      is bumped automatically by any mutating method.
    """

    name: str
    slug: str
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    plan: Plan = Plan.FREE
    is_active: bool = True
    created_at: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    updated_at: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    settings: dict = field(default_factory=dict)

    # Slug length bounds — anything outside this is almost certainly
    # an error (e.g. an empty string, or a value the persistence layer
    # can't index sensibly).
    _SLUG_MIN_LENGTH: ClassVar[int] = 2
    _SLUG_MAX_LENGTH: ClassVar[int] = 63
    _NAME_MAX_LENGTH: ClassVar[int] = 255

    # ---------- factory helpers ----------

    @classmethod
    def create(
        cls,
        name: str,
        slug: str,
        *,
        plan: Plan | str = Plan.FREE,
        is_active: bool = True,
        settings: dict | None = None,
    ) -> "Tenant":
        """
        Construct a new tenant.

        Prefer this over calling the dataclass initializer directly —
        it makes the intent ("I am creating a new tenant") explicit
        at call sites and gives us a single place to extend with
        domain events later (e.g. `TenantCreated`).
        """
        now = datetime.now(timezone.utc)
        return cls(
            name=name,
            slug=slug,
            plan=plan,  # type: ignore[arg-type]
            is_active=is_active,
            created_at=now,
            updated_at=now,
            settings=settings or {},
        )

    @classmethod
    def seed_slug(cls, slug: str) -> None:
        """
        Reserve a slug without creating a tenant.

        Used by the infrastructure layer when hydrating tenants from
        the database, so subsequent in-process `Tenant.create(...)`
        calls correctly recognize the slug as already taken. Calling
        this with a slug that is already reserved is a no-op.
        """
        _used_slugs.add(slug)

    @classmethod
    def from_persistence(
        cls,
        *,
        id: uuid.UUID,
        name: str,
        slug: str,
        plan: Plan,
        is_active: bool,
        created_at: datetime,
        updated_at: datetime,
        settings: dict,
    ) -> "Tenant":
        """
        Reconstruct a Tenant from a persistence-layer row.

        Unlike `create(...)`, this skips the in-process uniqueness
        check on `slug` — the database is the source of truth at this
        point, and a uniqueness violation here would mask a perfectly
        valid hydration. The slug is still added to the in-process
        registry so future `create(...)` calls in the same process
        will see it as taken.

        All other validation (timestamp coherence, plan value, type
        checks) is still applied.
        """
        # Bypass `__init__`/`__post_init__` entirely so we don't
        # re-validate slug uniqueness (the DB already enforced it).
        # We still run timestamp validation because that's a
        # property of the row data, not of the registry.
        instance = object.__new__(cls)
        object.__setattr__(instance, "id", id)
        object.__setattr__(instance, "name", name)
        object.__setattr__(instance, "slug", slug)
        object.__setattr__(instance, "plan", plan if isinstance(plan, Plan) else Plan(plan))
        object.__setattr__(instance, "is_active", is_active)
        object.__setattr__(instance, "created_at", created_at)
        object.__setattr__(instance, "updated_at", updated_at)
        object.__setattr__(instance, "settings", dict(settings or {}))
        cls._validate_timestamps(instance.created_at, instance.updated_at)
        _used_slugs.add(slug)
        return instance

    @classmethod
    def release_slug(cls, slug: str) -> None:
        """
        Release a previously reserved slug.

        Useful for tests and for the (rare) case where the persistence
        layer needs to forget a slug (e.g. after a transaction rollback).
        """
        _used_slugs.discard(slug)

    @classmethod
    def reset_slug_registry(cls) -> None:
        """Clear all reserved slugs. Intended for test isolation only."""
        _used_slugs.clear()

    # ---------- validation ----------

    def __post_init__(self) -> None:
        """Enforce the business rules documented on the class."""
        object.__setattr__(self, "name", self._validate_name(self.name))
        object.__setattr__(self, "slug", self._validate_and_reserve_slug(self.slug))
        object.__setattr__(self, "plan", self._validate_plan(self.plan))
        self._validate_timestamps(self.created_at, self.updated_at)
        if not isinstance(self.settings, dict):
            raise ValidationException(
                message="Tenant settings must be a dictionary.",
                code=400,
                data={"field": "settings"},
            )

    @staticmethod
    def _validate_name(name: str) -> str:
        if not isinstance(name, str):
            raise ValidationException(
                message="Tenant name must be a string.",
                code=400,
            )
        cleaned = name.strip()
        if not cleaned:
            raise ValidationException(
                message="Tenant name cannot be empty.",
                code=400,
                data={"field": "name"},
            )
        if len(cleaned) > Tenant._NAME_MAX_LENGTH:
            raise ValidationException(
                message=(
                    f"Tenant name cannot exceed {Tenant._NAME_MAX_LENGTH} "
                    "characters."
                ),
                code=400,
                data={"field": "name", "max_length": Tenant._NAME_MAX_LENGTH},
            )
        return cleaned

    def _validate_and_reserve_slug(self, slug: str) -> str:
        if not isinstance(slug, str):
            raise ValidationException(
                message="Tenant slug must be a string.",
                code=400,
            )
        cleaned = slug.strip().lower()
        if not cleaned:
            raise ValidationException(
                message="Tenant slug cannot be empty.",
                code=400,
                data={"field": "slug"},
            )
        if (
            len(cleaned) < self._SLUG_MIN_LENGTH
            or len(cleaned) > self._SLUG_MAX_LENGTH
        ):
            raise ValidationException(
                message=(
                    f"Tenant slug must be between {self._SLUG_MIN_LENGTH} "
                    f"and {self._SLUG_MAX_LENGTH} characters."
                ),
                code=400,
                data={
                    "field": "slug",
                    "min_length": self._SLUG_MIN_LENGTH,
                    "max_length": self._SLUG_MAX_LENGTH,
                },
            )
        if not _SLUG_PATTERN.match(cleaned):
            raise ValidationException(
                message=(
                    "Tenant slug must be lowercase alphanumeric with optional "
                    "single hyphens (e.g. 'acme-corp')."
                ),
                code=400,
                data={"field": "slug"},
            )
        if cleaned in _used_slugs:
            raise ConflictException(
                message=f"Tenant slug '{cleaned}' is already in use.",
                code=409,
                data={"field": "slug", "value": cleaned},
            )
        _used_slugs.add(cleaned)
        return cleaned

    @staticmethod
    def _validate_plan(plan: Plan | str) -> Plan:
        if isinstance(plan, Plan):
            return plan
        if isinstance(plan, str):
            try:
                return Plan(plan)
            except ValueError as exc:
                raise ValidationException(
                    message=(
                        f"Invalid plan '{plan}'. Must be one of: "
                        f"{', '.join(p.value for p in Plan)}."
                    ),
                    code=400,
                    data={"field": "plan", "value": plan},
                ) from exc
        raise ValidationException(
            message="Plan must be a Plan enum value or a valid plan string.",
            code=400,
            data={"field": "plan"},
        )

    @staticmethod
    def _validate_timestamps(created_at: datetime, updated_at: datetime) -> None:
        if created_at.tzinfo is None or updated_at.tzinfo is None:
            raise ValidationException(
                message="Timestamps must be timezone-aware.",
                code=400,
                data={"field": "created_at" if created_at.tzinfo is None else "updated_at"},
            )
        if updated_at < created_at:
            raise ValidationException(
                message="updated_at cannot be earlier than created_at.",
                code=400,
                data={"field": "updated_at"},
            )

    # ---------- mutators ----------

    def _touch(self) -> None:
        """Bump `updated_at` to the current UTC time."""
        object.__setattr__(self, "updated_at", datetime.now(timezone.utc))

    def rename(self, new_name: str) -> None:
        """Change the tenant's display name. Validates the new value."""
        object.__setattr__(self, "name", self._validate_name(new_name))
        self._touch()

    def change_plan(self, new_plan: Plan | str) -> None:
        """Change the tenant's subscription plan."""
        plan_value = self._validate_plan(new_plan)
        object.__setattr__(self, "plan", plan_value)
        self._touch()

    def change_slug(self, new_slug: str) -> None:
        """Change the tenant's slug. Releases the old one and reserves the new."""
        cleaned = self._validate_and_reserve_slug(new_slug)
        _used_slugs.discard(self.slug)
        object.__setattr__(self, "slug", cleaned)
        self._touch()

    def activate(self) -> None:
        """Mark the tenant as active."""
        if not self.is_active:
            object.__setattr__(self, "is_active", True)
            self._touch()

    def deactivate(self) -> None:
        """Mark the tenant as inactive (suspended/disabled)."""
        if self.is_active:
            object.__setattr__(self, "is_active", False)
            self._touch()

    def update_settings(self, new_settings: dict) -> None:
        """Replace the tenant's settings dict (validated)."""
        if not isinstance(new_settings, dict):
            raise ValidationException(
                message="Tenant settings must be a dictionary.",
                code=400,
                data={"field": "settings"},
            )
        object.__setattr__(self, "settings", dict(new_settings))
        self._touch()

    # ---------- identity helpers ----------

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Tenant):
            return NotImplemented
        return self.id == other.id

    def __hash__(self) -> int:
        return hash(self.id)

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return (
            f"Tenant(id={self.id!r}, name={self.name!r}, slug={self.slug!r}, "
            f"plan={self.plan!r}, is_active={self.is_active!r})"
        )


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------


_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@dataclass(eq=False)
class User:
    """
    User — a person who can sign in to a specific tenant.

    Business rules:

    * `email` is non-empty, lowercased, basic format validated, and
      unique within the owning tenant (the uniqueness check itself
      lives in the repository because it requires a database).
    * The entity **never** stores a raw password — only the hash. The
      constructor refuses any value that is not already a recognized
      bcrypt hash.
    * `is_active` controls whether the user can authenticate; the
      authentication service rejects inactive users.
    * `last_login` is set by the authentication service, never by the
      user themselves.
    """

    tenant_id: uuid.UUID
    email: str
    hashed_password: str
    role: Role
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    full_name: str | None = None
    is_active: bool = True
    last_login: datetime | None = None
    created_at: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    updated_at: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    # Recognized bcrypt-hash prefix. We refuse to construct a User
    # around anything that does not look like a hash, which enforces
    # the "password never stored raw" rule at the domain level.
    _BCRYPT_PREFIXES: ClassVar[tuple[str, ...]] = ("$2a$", "$2b$", "$2y$")

    # ---------- factory ----------

    @classmethod
    def create(
        cls,
        tenant_id: uuid.UUID,
        email: str,
        hashed_password: str,
        role: Role | str,
        *,
        full_name: str | None = None,
        is_active: bool = True,
    ) -> "User":
        """Construct a new user. `hashed_password` must already be a hash."""
        now = datetime.now(timezone.utc)
        return cls(
            tenant_id=tenant_id,
            email=email,
            hashed_password=hashed_password,
            role=role,  # type: ignore[arg-type]
            full_name=full_name,
            is_active=is_active,
            created_at=now,
            updated_at=now,
        )

    # ---------- validation ----------

    def __post_init__(self) -> None:
        self._validate_tenant_id(self.tenant_id)
        object.__setattr__(self, "email", self._validate_email(self.email))
        self._validate_hashed_password(self.hashed_password)
        object.__setattr__(self, "role", self._validate_role(self.role))
        self._validate_timestamps(self.created_at, self.updated_at)
        if self.last_login is not None and self.last_login.tzinfo is None:
            raise ValidationException(
                message="last_login must be timezone-aware.",
                code=400,
                data={"field": "last_login"},
            )

    @staticmethod
    def _validate_tenant_id(tenant_id: uuid.UUID) -> None:
        if not isinstance(tenant_id, uuid.UUID):
            raise ValidationException(
                message="User tenant_id must be a UUID.",
                code=400,
                data={"field": "tenant_id"},
            )

    @staticmethod
    def _validate_email(email: str) -> str:
        if not isinstance(email, str):
            raise ValidationException(
                message="User email must be a string.",
                code=400,
            )
        cleaned = email.strip().lower()
        if not cleaned:
            raise ValidationException(
                message="User email cannot be empty.",
                code=400,
                data={"field": "email"},
            )
        if len(cleaned) > 320:
            raise ValidationException(
                message="User email cannot exceed 320 characters.",
                code=400,
                data={"field": "email", "max_length": 320},
            )
        if not _EMAIL_PATTERN.match(cleaned):
            raise ValidationException(
                message="User email is not a valid email address.",
                code=400,
                data={"field": "email"},
            )
        return cleaned

    def _validate_hashed_password(self, hashed: str) -> None:
        if not isinstance(hashed, str) or not hashed:
            raise ValidationException(
                message="Hashed password is required.",
                code=400,
                data={"field": "password"},
            )
        if not any(hashed.startswith(p) for p in self._BCRYPT_PREFIXES):
            # The entity never accepts a raw password. The
            # authentication flow must hash the password via
            # `security.hash_password` before constructing a User.
            raise ValidationException(
                message=(
                    "Password must be provided as a bcrypt hash, never in "
                    "raw form. Use security.hash_password before creating "
                    "a User."
                ),
                code=400,
                data={"field": "password"},
            )
        if len(hashed) > 1024:
            raise ValidationException(
                message="Hashed password is unreasonably long.",
                code=400,
                data={"field": "password"},
            )

    @staticmethod
    def _validate_role(role: Role | str) -> Role:
        if isinstance(role, Role):
            return role
        if isinstance(role, str):
            try:
                return Role(role)
            except ValueError as exc:
                raise ValidationException(
                    message=(
                        f"Invalid role '{role}'. Must be one of: "
                        f"{', '.join(r.value for r in Role)}."
                    ),
                    code=400,
                    data={"field": "role", "value": role},
                ) from exc
        raise ValidationException(
            message="Role must be a Role enum value or a valid role string.",
            code=400,
            data={"field": "role"},
        )

    @staticmethod
    def _validate_timestamps(created_at: datetime, updated_at: datetime) -> None:
        if created_at.tzinfo is None or updated_at.tzinfo is None:
            raise ValidationException(
                message="Timestamps must be timezone-aware.",
                code=400,
                data={"field": "created_at" if created_at.tzinfo is None else "updated_at"},
            )

    # ---------- mutators ----------

    def _touch(self) -> None:
        object.__setattr__(self, "updated_at", datetime.now(timezone.utc))

    def set_full_name(self, new_name: str | None) -> None:
        if new_name is not None:
            new_name = new_name.strip() or None
        object.__setattr__(self, "full_name", new_name)
        self._touch()

    def change_role(self, new_role: Role | str) -> None:
        role_value = self._validate_role(new_role)
        object.__setattr__(self, "role", role_value)
        self._touch()

    def deactivate(self) -> None:
        if self.is_active:
            object.__setattr__(self, "is_active", False)
            self._touch()

    def activate(self) -> None:
        if not self.is_active:
            object.__setattr__(self, "is_active", True)
            self._touch()

    def record_login(self, when: datetime | None = None) -> None:
        """Stamp `last_login`. Called by the authentication service."""
        when = when or datetime.now(timezone.utc)
        if when.tzinfo is None:
            raise ValidationException(
                message="last_login must be timezone-aware.",
                code=400,
                data={"field": "last_login"},
            )
        object.__setattr__(self, "last_login", when)
        self._touch()

    def can_login(self) -> bool:
        return self.is_active

    def assert_can_login(self) -> None:
        if not self.is_active:
            raise UnauthorizedException(
                message="User account is inactive and cannot log in.",
                code=401,
                data={"field": "is_active"},
            )

    # ---------- identity ----------

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, User):
            return NotImplemented
        return self.id == other.id

    def __hash__(self) -> int:
        return hash(self.id)

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return (
            f"User(id={self.id!r}, tenant_id={self.tenant_id!r}, "
            f"email={self.email!r}, role={self.role!r}, is_active={self.is_active!r})"
        )


# ---------------------------------------------------------------------------
# ApiKey
# ---------------------------------------------------------------------------


@dataclass(eq=False)
class ApiKey:
    """
    API key — a programmatic credential scoped to a tenant.

    Business rules:

    * Only the **hash** of the key is ever stored. The raw key value
      is generated by the application service, shown to the caller
      exactly once at creation time, and then discarded. The entity
      constructor refuses any value that does not look like a bcrypt
      hash.
    * A key with `revoked_at` set is invalid. The `is_valid()`
      helper encodes that for the auth and rate-limit code paths.
    """

    tenant_id: uuid.UUID
    name: str
    key_hash: str
    scopes: list[str]
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    last_used_at: datetime | None = None
    revoked_at: datetime | None = None
    created_at: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    # ---------- factory ----------

    @classmethod
    def create(
        cls,
        tenant_id: uuid.UUID,
        name: str,
        key_hash: str,
        scopes: list[str] | None = None,
    ) -> "ApiKey":
        """Construct a new API key. `key_hash` must already be a bcrypt hash."""
        return cls(
            tenant_id=tenant_id,
            name=name,
            key_hash=key_hash,
            scopes=list(scopes) if scopes else [],
        )

    # ---------- validation ----------

    def __post_init__(self) -> None:
        self._validate_tenant_id(self.tenant_id)
        self._validate_name(self.name)
        self._validate_key_hash(self.key_hash)
        self._validate_scopes(self.scopes)
        if self.last_used_at is not None and self.last_used_at.tzinfo is None:
            raise ValidationException(
                message="last_used_at must be timezone-aware.",
                code=400,
                data={"field": "last_used_at"},
            )
        if self.revoked_at is not None and self.revoked_at.tzinfo is None:
            raise ValidationException(
                message="revoked_at must be timezone-aware.",
                code=400,
                data={"field": "revoked_at"},
            )

    @staticmethod
    def _validate_tenant_id(tenant_id: uuid.UUID) -> None:
        if not isinstance(tenant_id, uuid.UUID):
            raise ValidationException(
                message="ApiKey tenant_id must be a UUID.",
                code=400,
                data={"field": "tenant_id"},
            )

    @staticmethod
    def _validate_name(name: str) -> None:
        if not isinstance(name, str) or not name.strip():
            raise ValidationException(
                message="ApiKey name cannot be empty.",
                code=400,
                data={"field": "name"},
            )
        if len(name) > 255:
            raise ValidationException(
                message="ApiKey name cannot exceed 255 characters.",
                code=400,
                data={"field": "name", "max_length": 255},
            )

    def _validate_key_hash(self, key_hash: str) -> None:
        if not isinstance(key_hash, str) or not key_hash:
            raise ValidationException(
                message="ApiKey key_hash is required.",
                code=400,
                data={"field": "key_hash"},
            )
        # The raw key never reaches this entity. The application
        # service must call `security.hash_api_key` and pass the
        # resulting bcrypt hash here.
        if not any(key_hash.startswith(p) for p in User._BCRYPT_PREFIXES):
            raise ValidationException(
                message=(
                    "ApiKey key_hash must be a bcrypt hash. The raw key "
                    "value is never stored — hash it via "
                    "security.hash_api_key before constructing an ApiKey."
                ),
                code=400,
                data={"field": "key_hash"},
            )

    @staticmethod
    def _validate_scopes(scopes: list[str]) -> None:
        if not isinstance(scopes, list):
            raise ValidationException(
                message="ApiKey scopes must be a list of strings.",
                code=400,
                data={"field": "scopes"},
            )
        for scope in scopes:
            if not isinstance(scope, str) or not scope.strip():
                raise ValidationException(
                    message="Each ApiKey scope must be a non-empty string.",
                    code=400,
                    data={"field": "scopes"},
                )

    # ---------- mutators ----------

    def record_usage(self, when: datetime | None = None) -> None:
        """Stamp `last_used_at`. Called by the auth middleware."""
        when = when or datetime.now(timezone.utc)
        if when.tzinfo is None:
            raise ValidationException(
                message="last_used_at must be timezone-aware.",
                code=400,
                data={"field": "last_used_at"},
            )
        object.__setattr__(self, "last_used_at", when)

    def revoke(self, when: datetime | None = None) -> None:
        """Revoke this key. Revocation is idempotent."""
        if self.revoked_at is not None:
            return
        when = when or datetime.now(timezone.utc)
        if when.tzinfo is None:
            raise ValidationException(
                message="revoked_at must be timezone-aware.",
                code=400,
                data={"field": "revoked_at"},
            )
        object.__setattr__(self, "revoked_at", when)

    def is_valid(self) -> bool:
        """A key is valid only if it has not been revoked."""
        return self.revoked_at is None

    def assert_valid(self) -> None:
        if not self.is_valid():
            raise UnauthorizedException(
                message="API key has been revoked.",
                code=401,
                data={"field": "revoked_at"},
            )

    def has_scope(self, scope: str) -> bool:
        """Return True when the key's scope list contains `scope` or '*'."""
        return "*" in self.scopes or scope in self.scopes

    def assert_has_scope(self, scope: str) -> None:
        if not self.has_scope(scope):
            raise UnauthorizedException(
                message=f"API key is missing required scope '{scope}'.",
                code=401,
                data={"field": "scopes", "required": scope},
            )

    # ---------- identity ----------

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, ApiKey):
            return NotImplemented
        return self.id == other.id

    def __hash__(self) -> int:
        return hash(self.id)

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return (
            f"ApiKey(id={self.id!r}, tenant_id={self.tenant_id!r}, "
            f"name={self.name!r}, scopes={self.scopes!r}, "
            f"revoked={self.revoked_at is not None})"
        )


__all__ = ["ApiKey", "Plan", "Role", "Tenant", "User"]


# Re-export common exceptions from this module for convenient
# `from src.identity.domain.entities import NotFoundException` style
# imports in callers. Importing them again is a no-op, just gives a
# single namespace for domain code.
_ = NotFoundException
