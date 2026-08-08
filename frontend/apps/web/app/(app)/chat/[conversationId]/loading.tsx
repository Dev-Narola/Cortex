/**
 * Conversation route — loading state.
 *
 * **F4 Part 1 (Task 15).** Same Skeleton chrome as
 * the parent `/chat` route; lives in the dynamic
 * segment so it only fires for the conversation
 * view (the static `/chat` route has its own).
 */

import { Card, Skeleton } from "@cortex/ui"

export default function ConversationLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 sm:px-6">
        <Skeleton variant="text" className="h-5 w-56" />
        <Skeleton variant="rect" className="h-8 w-20 rounded-md" />
      </div>
      <div className="flex flex-1 flex-col gap-4 overflow-hidden px-4 py-6 sm:px-6">
        <div className="ml-auto">
          <Skeleton variant="rect" className="h-12 w-64 rounded-2xl" />
        </div>
        <div className="mr-auto">
          <Skeleton variant="rect" className="h-20 w-96 rounded-2xl" />
        </div>
      </div>
      <div className="border-t border-border bg-card/50 px-4 py-3 sm:px-6">
        <Card>
          <Skeleton variant="rect" className="h-10 w-full rounded-md" />
        </Card>
      </div>
    </div>
  )
}
