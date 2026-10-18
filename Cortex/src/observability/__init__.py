"""Observability bounded context.

Cross-cutting *operational* concerns — tracing, metrics,
health, structured logging, evaluation, audit — that exist so
the rest of the system is *measurable* and *defensible*.

Pure-technical setup (FastAPI middleware, structlog config,
SQLAlchemy engine helpers) lives in ``src/core``. Anything
domain-shaped — what a "usage event" is, what an "audit
event" looks like, how a retrieval evaluation is scored —
lives here.
"""
