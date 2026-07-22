# 5. Object Storage (AWS S3) for Large Files

Date: 2026-07-22

## Status

Accepted

## Context

The Ingestion module is responsible for accepting, storing, and processing documents (PDFs, DOCX, TXT, MD) uploaded by tenants. Storing these large binary blobs directly in PostgreSQL (e.g., via `BYTEA`) would rapidly inflate database size, degrade backup performance, and consume expensive relational database compute resources for simple I/O operations.

## Decision

We will use **AWS S3** (or S3-compatible APIs like MinIO for local development) via the `boto3` library as our primary object storage solution for documents.

- The application will expose an abstraction layer (`ObjectStorage` interface) to decouple the domain logic from the specific boto3 implementation.
- S3 will strictly be treated as a dumb blob store. It will not handle authorization or domain logic.

## Consequences

- **Positive:** Infinite horizontal scalability for file storage. Extremely cost-effective compared to relational database storage.
- **Positive:** Offloads heavy I/O operations from the primary PostgreSQL database, keeping it lean and performant.
- **Negative:** Introduces an external infrastructure dependency.
- **Negative:** Creates a distributed state problem. We must now maintain consistency between document metadata (in PostgreSQL) and the physical files (in S3). See ADR 0007 for the consistency strategy.
