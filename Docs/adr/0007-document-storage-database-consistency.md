# 7. Document Storage and Database Consistency

Date: 2026-07-22

## Status

Accepted

## Context

When a user uploads or deletes a document, two distinct systems must be updated:
1. **PostgreSQL:** Stores the document metadata, tenant association, and processing status.
2. **AWS S3:** Stores the physical binary file.

Because these are separate distributed systems, they cannot participate in a single atomic transaction (two-phase commit is too complex, slow, and unreliable for this use case). We must address the following questions:
- What happens when one system succeeds and the other fails?
- Which system is the absolute source of truth?
- How do we handle orphaned objects?

## Decision

We designate **PostgreSQL as the absolute source of truth** and adopt a **"Metadata-First"** consistency strategy.

### 1. Document Creation Strategy
1. **Insert Metadata (DB):** Create the document record in PostgreSQL with a `PENDING` status. Commit the transaction.
2. **Upload Object (S3):** Stream the file to S3.
3. **Update Metadata (DB):** Update the PostgreSQL record status to `READY` and save the S3 URI. Commit the transaction.

### 2. Document Deletion Strategy
1. **Delete Metadata (DB):** Remove the document record from PostgreSQL. Commit the transaction.
2. **Delete Object (S3):** Issue a delete request to S3.

## Consequences

### What happens on partial failure?
- **Upload fails:** The DB contains a `PENDING` document. The user sees the upload failed, but the metadata exists. We have no orphaned blobs in S3. The `PENDING` record can be safely retried by the user or swept by a future background job.
- **Delete fails (DB succeeds, S3 fails):** The metadata is gone, so the document is immediately invisible to the user and the application. However, the physical blob remains in S3, becoming an **orphaned object**.

### How are orphaned objects handled?
Orphaned objects in S3 are acceptable and are considered a minor cost-inefficiency rather than a critical system failure. 
They will be handled asynchronously:
- We can configure an S3 Lifecycle Rule to automatically expire objects not accessed or marked by a specific tag.
- Alternatively, a periodic background cron job can run a reconciliation process, scanning S3 keys and deleting any blobs that do not have a corresponding record in PostgreSQL.

### Conclusion
By treating the Database as the source of truth and using a Metadata-First approach, we prioritize data integrity and application consistency over storage efficiency. We accept the risk of orphaned S3 objects to avoid the much worse scenario of orphaned database records (which would cause 404s when users try to download a file that doesn't exist).
