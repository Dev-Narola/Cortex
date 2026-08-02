"""
Knowledge-Graph security policy (V7 — Phase 10).

This module is the *defense-in-depth* layer over
the per-repository ``WHERE tenant_id = ?``
filtering. The repository layer is the first line
of defense — every query already passes the
caller's ``tenant_id`` through. The policy here
adds two things the repository cannot:

1. A **centralised tenant check** that callers
   can use before they hand a request to the
   application service. The check is what
   :class:`GraphSecurityPolicy.assert_can_access`
   exposes; tests use it to assert the
   "tenant A cannot read tenant B" rule without
   going through the whole REST / GraphQL stack.

2. A **role check** for the actions the spec
   calls out: only ``owner`` and ``admin`` can
   trigger a graph extraction. The check is
   :func:`require_extraction_role` and is the
   dependency the REST ``POST /graph/extract``
   route hangs on. A future
   ``POST /graph/entities`` (manual entity
   creation) would use the same dependency.

The class is intentionally tiny: the policy is
a documentation artefact as much as a code
artefact. Every check here is something the
caller could do by hand; the policy exists so
the rule lives in *one* place and a security
review reads the rule from a single file.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from src.identity.domain.entities import Role, User
from src.shared.exceptions import (
    ForbiddenException,
    UnauthorizedException,
    ValidationException,
)


# The roles permitted to trigger graph extraction.
# A future ``MEMBER`` mode (a developer who can
# read the graph but not extract) is a V9 item;
# the spec says ``owner`` and ``admin`` for V7.
EXTRACTION_ROLES: frozenset[str] = frozenset({"owner", "admin"})


@dataclass(frozen=True, slots=True)
class TenantScope:
    """A typed pair of (caller, target) for a security check.

    The :class:`GraphSecurityPolicy` takes one of
    these rather than two raw UUIDs so the
    parameter list is self-documenting and a
    future addition (e.g. a per-tenant
    ``extraction_enabled`` feature flag) is a
    single field.
    """

    caller_tenant_id: uuid.UUID
    target_tenant_id: uuid.UUID

    def is_same_tenant(self) -> bool:
        return self.caller_tenant_id == self.target_tenant_id


class GraphSecurityPolicy:
    """The V7 KG security policy.

    Stateless. Inject a single instance via DI
    and call its methods. Tests construct a
    default instance; the production wiring
    matches.
    """

    def assert_can_access(
        self,
        *,
        user: User,
        target_tenant_id: uuid.UUID,
    ) -> None:
        """The single rule from Phase 10 Rule 1: tenant cannot see other tenants.

        Raises :class:`ForbiddenException` when
        the user's tenant id does not match the
        target. The 403 is the spec's required
        response; the rest of the codebase uses
        404 ("not found") for cross-tenant
        lookups to avoid leaking the existence
        of rows. The security policy uses 403
        because it is a *defense-in-depth* check
        that runs *before* the lookup — the
        caller's intent is clear, and a 403
        documents the security boundary.
        """
        if not isinstance(user, User):
            raise UnauthorizedException(
                message="authenticated user is required",
                code=401,
                data={"field": "user"},
            )
        if not isinstance(target_tenant_id, uuid.UUID):
            raise ValidationException(
                message="target_tenant_id must be a UUID",
                code=400,
                data={"field": "target_tenant_id"},
            )
        if user.tenant_id != target_tenant_id:
            raise ForbiddenException(
                message=(
                    "user cannot access another tenant's knowledge graph"
                ),
                code=403,
                data={
                    "caller_tenant_id": str(user.tenant_id),
                    "target_tenant_id": str(target_tenant_id),
                },
            )

    def assert_can_extract(
        self,
        *,
        user: User,
        target_tenant_id: uuid.UUID,
    ) -> None:
        """The Phase 10 Rule 2 check: only owner / admin can extract.

        Combines the tenant-isolation check with
        the role check. The role check is the
        *second* precondition — the user has to
        both belong to the target tenant *and*
        have the ``owner`` / ``admin`` role.
        """
        self.assert_can_access(user=user, target_tenant_id=target_tenant_id)
        if user.role.value not in EXTRACTION_ROLES:
            raise ForbiddenException(
                message=(
                    "extraction is restricted to owner / admin; "
                    f"caller has role '{user.role.value}'"
                ),
                code=403,
                data={
                    "field": "role",
                    "required": sorted(EXTRACTION_ROLES),
                    "actual": user.role.value,
                },
            )


def require_extraction_role(user: User, *, target_tenant_id: uuid.UUID) -> None:
    """Convenience wrapper for the REST route's dependency.

    Mirrors the pattern
    :func:`src.core.dependencies.require_owner`
    uses — the route handler calls
    ``require_extraction_role(current_user, target_tenant_id=tenant.id)``
    and the helper raises 401/403 as needed.
    The function is a free function rather than
    a class method so callers do not have to
    thread a :class:`GraphSecurityPolicy`
    instance through every route.
    """
    GraphSecurityPolicy().assert_can_extract(
        user=user, target_tenant_id=target_tenant_id
    )


__all__ = [
    "EXTRACTION_ROLES",
    "GraphSecurityPolicy",
    "TenantScope",
    "require_extraction_role",
]
