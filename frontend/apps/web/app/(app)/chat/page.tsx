/**
 * Chat route — `/chat`.
 *
 * **F4 Part 1 (Task 14).** When the user visits
 * `/chat` with no conversation id, the screen
 * shows the empty state + the input. The first
 * send will trigger `POST /conversations` (in
 * Part 1 the hook returns a placeholder toast so
 * the input is exercisable end-to-end; Part 2
 * will replace it with the real flow).
 *
 * **Server entry.** Same split as the F3
 * documents page — `page.tsx` is the server
 * component, `ChatView` is the client composer.
 * Keeps the React Query / router hooks out of
 * the pre-render path.
 */

import { ChatView } from "./ChatView"

export default function ChatPage() {
  return <ChatView />
}
