# 4. Role-Based Access Control (RBAC) Model

Date: 2026-07-22

## Status

Accepted

## Context

Within a tenant, different users require different levels of access. A flat permission model (where everyone in a tenant is an admin) is insufficient for enterprise use cases. We need a standardized way to assign permissions to users relative to a tenant.

## Decision

We will implement a static **Role-Based Access Control (RBAC)** model.

- Users do not have global roles; their roles are contextualized to a specific `Tenant`.
- The relationship between a `User` and a `Tenant` is mediated by a `TenantMember` entity, which holds the `Role`.
- Roles map to specific granular permissions (e.g., `document:read`, `document:write`).
- Initial static roles defined in code: `OWNER`, `ADMIN`, `MEMBER`, `VIEWER`.

## Consequences

- **Positive:** Clear, well-understood model for authorization. Easy to map to UI concepts (e.g., a dropdown to select a user's role).
- **Positive:** Decouples the definition of what a role can do (permissions) from the assignment of the role, allowing us to easily add new permissions to existing roles in the future.
- **Negative:** Static roles limit flexibility. If a customer demands custom roles (e.g., a role that can read documents but not view billing), we will need to refactor the RBAC system to support dynamic, database-driven role definitions.
