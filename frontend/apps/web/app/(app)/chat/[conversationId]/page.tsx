/**
 * Conversation route — `/chat/{conversationId}`.
 *
 * **F4 Part 1 (Task 6).** Server component that
 * renders the client `ConversationView`. The
 * dynamic segment is exposed via React's
 * `use(params)` hook on the client side (Next.js
 * 15's `params` is a Promise).
 *
 * **Auth.** Inherits the (app) group's
 * `ProtectedRoute` + `OnboardingGuard` from F3.
 * No additional auth check here — the API client
 * sends the Bearer + handles 401.
 */

import { ConversationView } from "./ConversationView"

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>
}) {
  const { conversationId } = await params
  return <ConversationView conversationId={conversationId} />
}
