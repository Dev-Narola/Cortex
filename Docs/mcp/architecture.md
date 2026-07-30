# Cortex Model Context Protocol (MCP) Architecture & Integration Guide

## Overview

Cortex V8 introduces a complete **Model Context Protocol (MCP)** server layer, transforming Cortex into an AI platform that any external AI client (Claude Desktop, Cursor, VS Code extensions, custom Python/JS agents, CrewAI, AutoGen) can securely connect to over JSON-RPC 2.0.

---

## Endpoints & Transports

- **HTTP POST**: `POST /api/v1/mcp` (JSON-RPC 2.0 requests & responses)
- **WebSocket**: `WS /ws/mcp` (Persistent bidirectional JSON-RPC 2.0 streams)
- **STDIO**: Native Standard I/O wrapper for CLI tools.

---

## Authentication

Clients authenticate using either:
1. `X-API-Key: ctx_...` HTTP header
2. `Authorization: Bearer <JWT_TOKEN>` HTTP header

---

## Supported Tools

| Tool Name | Description |
| :--- | :--- |
| `search_documents` | Hybrid vector and full-text search across knowledge base chunks |
| `retrieve_context` | Graph-aware hybrid RAG retrieval combining vector chunks and Knowledge Graph facts |
| `graph_search` | Search Knowledge Graph entities and relationship paths |
| `run_agent` | Execute internal Cortex autonomous agents for a goal message |
| `list_documents` | List uploaded tenant documents |
| `upload_document` | Ingest new text documents into tenant knowledge base |
| `query_memory` | Retrieve agent step history and execution memory |

---

## Data Resources

- `cortex://knowledge/document/{id}` — Knowledge Document content
- `cortex://graph/entity/{id}` — Knowledge Graph Entity details
- `cortex://graph/path/{id}` — Graph Traversal & Neighbor connections
- `cortex://memory/{id}` — Agent Execution Memory
- `cortex://tenant/settings` — Current Tenant Configuration

---

## Prompts

- `summarize_document`
- `explain_architecture`
- `generate_meeting_notes`
- `review_code`
