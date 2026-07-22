# 3. JWT and API Key Authentication

Date: 2026-07-22

## Status

Accepted

## Context

The application serves two distinct types of clients:
1. **Human Users:** Interacting via a web interface or CLI, requiring session management.
2. **Machine Clients:** Interacting programmatically via automated scripts, CI/CD pipelines, or external systems, requiring long-lived, predictable authentication credentials.

Using a single authentication mechanism for both is suboptimal. Short-lived tokens are frustrating for programmatic access, while long-lived API keys are insecure for browser-based sessions.

## Decision

We will implement a dual-authentication strategy:
- **JWT (JSON Web Tokens):** Used for human users. Tokens are short-lived, signed, and represent a specific user session within a tenant context.
- **API Keys:** Used for programmatic access. Keys are generated per tenant, mapped to specific scopes (e.g., `document:read`, `document:write`), and stored as salted hashes in the database.

## Consequences

- **Positive:** Provides optimal developer experience (DX) for programmatic access while maintaining security best practices for web sessions.
- **Positive:** API keys allow for fine-grained scoping and easy revocation without invalidating user sessions.
- **Negative:** Increased complexity in the authentication middleware, which must now check and validate two different types of credentials on incoming requests.
- **Security:** API keys must never be stored in plaintext. They are generated once, returned to the user, and immediately hashed using `passlib` (bcrypt/argon2) before storage.
