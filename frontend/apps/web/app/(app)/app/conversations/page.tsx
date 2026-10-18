import { redirect } from "next/navigation"

// Conversations are listed in Chat; keep the old URL working.
export default function ConversationsPage() {
  redirect("/chat")
}
