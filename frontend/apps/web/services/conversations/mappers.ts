/**
 * Wire (snake_case, as the backend sends it) → app types (camelCase).
 * Every REST read of a conversation or message goes through these, so
 * components can rely on `updatedAt`, `retrievedChunkIds`, etc. being set.
 */

import { type Citation, makeCitationId } from "@/types/citation"
import type { Conversation, Message, MessageRole } from "@/types/conversation"

interface WireCitation {
  document_id: string
  chunk_id: string
  document_title: string
  chunk_index: number
  score?: number
  excerpt?: string | null
}

interface WireMessage {
  id: string
  conversation_id: string
  role: string
  content: string
  token_count?: number
  retrieved_chunk_ids?: string[]
  model_name?: string | null
  agent_run_id?: string | null
  citations?: WireCitation[]
  created_at: string
}

interface WireConversation {
  id: string
  tenant_id: string
  user_id: string
  title: string
  summary?: string | null
  created_at: string
  updated_at: string
  messages?: WireMessage[]
}

export function toMessage(m: WireMessage): Message {
  const ids = m.retrieved_chunk_ids ?? []
  // Number each source by its position in retrieved_chunk_ids, the order the
  // model cited them in ([1], [2] …), even if some sources were since deleted.
  const citations: Citation[] = (m.citations ?? []).map((c) => ({
    id: makeCitationId(c.chunk_id),
    index: ids.indexOf(c.chunk_id) + 1,
    documentId: c.document_id,
    chunkId: c.chunk_id,
    documentTitle: c.document_title,
    chunkIndex: c.chunk_index,
    score: c.score ?? 0,
    excerpt: c.excerpt ?? null,
  }))
  return {
    id: m.id,
    conversationId: m.conversation_id,
    role: m.role as MessageRole,
    content: m.content,
    tokenCount: m.token_count ?? 0,
    retrievedChunkIds: ids,
    citations,
    modelName: m.model_name ?? null,
    agentRunId: m.agent_run_id ?? null,
    createdAt: m.created_at,
  }
}

export function toConversation(c: WireConversation): Conversation {
  return {
    id: c.id,
    tenantId: c.tenant_id,
    userId: c.user_id,
    title: c.title,
    summary: c.summary ?? null,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    ...(c.messages ? { messages: c.messages.map(toMessage) } : {}),
  }
}

export type { WireConversation, WireMessage }
