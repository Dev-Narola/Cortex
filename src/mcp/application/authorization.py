"""
Tool & Resource Authorization Service for enforcing role, permission, and tenant rules.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from src.mcp.domain.exceptions import ResourceAccessDenied, ToolExecutionDenied

logger = logging.getLogger(__name__)


class ToolAuthorizationService:
    """Service validating client role, permission, and tenant boundaries for tool and resource execution."""

    ROLE_HIERARCHY = {
        "owner": 3,
        "admin": 2,
        "member": 1,
        "viewer": 0,
    }

    def validate_tool_access(
        self,
        *,
        user_role: str,
        required_roles: tuple[str, ...],
        tool_name: str,
    ) -> None:
        """Validate if user_role satisfies required_roles."""
        if not required_roles:
            return

        user_level = self.ROLE_HIERARCHY.get(user_role.lower(), 0)
        min_required_level = min(
            self.ROLE_HIERARCHY.get(r.lower(), 1) for r in required_roles
        )

        if user_level < min_required_level:
            logger.warning(
                "mcp.tool_access_denied user_role=%s required=%s tool=%s",
                user_role,
                required_roles,
                tool_name,
            )
            raise ToolExecutionDenied(
                message=f"Role '{user_role}' is not authorized to execute tool '{tool_name}'",
                data={"user_role": user_role, "tool_name": tool_name, "required": required_roles},
            )

    def validate_tenant_boundary(
        self,
        *,
        request_tenant_id: uuid.UUID,
        target_tenant_id: uuid.UUID,
        resource_id: str = "",
    ) -> None:
        """Enforce strict multi-tenant boundary."""
        if request_tenant_id != target_tenant_id:
            logger.error(
                "mcp.cross_tenant_access_attempt request_tenant=%s target_tenant=%s resource=%s",
                request_tenant_id,
                target_tenant_id,
                resource_id,
            )
            raise ResourceAccessDenied(
                message="Cross-tenant access forbidden",
                data={
                    "request_tenant_id": str(request_tenant_id),
                    "target_tenant_id": str(target_tenant_id),
                },
            )


__all__ = ["ToolAuthorizationService"]
