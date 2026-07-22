# 1. Modular Monolith Architecture

Date: 2026-07-22

## Status

Accepted

## Context

We are building a multi-tenant SaaS application that requires robust scaling, strict data isolation, and clear logical boundaries. While microservices offer independent deployability and scaling, they introduce immense operational complexity, network latency, and distributed transaction issues early in a project's lifecycle. Conversely, a traditional monolithic architecture can quickly devolve into a "big ball of mud" where boundaries blur, making the system difficult to maintain and evolve.

We need an architecture that balances the deployment simplicity of a monolith with the strict domain boundaries of microservices.

## Decision

We will adopt a **Modular Monolith** architecture based on Domain-Driven Design (DDD) principles.

- **Logical Isolation:** The application is split into strict, independent domains (e.g., `identity`, `ingestion`, `observability`).
- **Physical Monolith:** These domains are compiled and deployed together as a single FastAPI application.
- **Strict Boundaries:** Domains must not share internal state, bypass repositories, or directly access each other's database tables. Communication between domains must occur through well-defined application services or asynchronous events.
- **Third-Party Libraries:** We use `FastAPI` as our web framework due to its strong typing, async support, and high performance.

## Consequences

- **Positive:** Deployment and local development remain simple (one service to run). Refactoring across domains is easier than in microservices since the code resides in a single repository.
- **Positive:** We avoid the overhead of network serialization, distributed tracing, and complex orchestration for intra-system communication in the early phases.
- **Negative:** We must be extremely disciplined in code reviews to prevent boundary bleed. If developers bypass interfaces to directly access another module's internal code, the modularity is compromised.
- **Future:** If a specific domain (e.g., `ingestion`) requires disparate scaling profiles later, it can be extracted into a microservice with minimal friction because the logical boundaries are already enforced.
