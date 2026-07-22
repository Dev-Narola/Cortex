# 2. PostgreSQL as Primary Database

Date: 2026-07-22

## Status

Accepted

## Context

The system requires a highly reliable, strongly consistent data store for managing tenant profiles, user identities, API keys, and document metadata. The multi-tenant nature of the system demands robust transaction support and complex relational querying capabilities to enforce isolation and access controls.

## Decision

We will use **PostgreSQL** as the primary relational database, accessed via **SQLAlchemy (ORM)** and managed with **Alembic** for schema migrations.

- **PostgreSQL:** Chosen for its proven reliability, strict ACID compliance, and excellent support for semi-structured data via `JSONB` (which is useful for flexible metadata storage in the future).
- **SQLAlchemy:** Chosen as the ORM to abstract SQL dialects and provide a robust object-relational mapping layer.

## Consequences

- **Positive:** Strong transactional guarantees ensure that critical operations (like granting access or modifying tenant state) are safe.
- **Positive:** Mature ecosystem, well-understood operational characteristics, and broad support in managed cloud environments (e.g., AWS RDS, GCP Cloud SQL).
- **Negative:** Requires rigorous schema migration management (Alembic). Scaling writes horizontally is notoriously difficult compared to NoSQL solutions, meaning we will rely on vertical scaling and read replicas as we grow.
