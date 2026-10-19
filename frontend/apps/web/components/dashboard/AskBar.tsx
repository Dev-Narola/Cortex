/**
 * AskBar — the dashboard's floating question composer.
 *
 * Submitting creates a real conversation and opens it with the answer
 * streaming (useStartConversation); there is no separate fake flow.
 */

"use client"

import { type FormEvent, useState } from "react"

import { Icon, Spinner } from "@cortex/ui"

import { BoltMark } from "@/components/chat/BoltMark"
import { useStartConversation } from "@/hooks/chat"

export function AskBar({ hint }: { hint?: string }) {
  const [value, setValue] = useState("")
  const { start, isPending } = useStartConversation()
  const empty = value.trim().length === 0

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (empty || isPending) return
    void start(value)
  }

  return (
    <form onSubmit={onSubmit} aria-label="Ask Cortex" className="w-full">
      <div className="flex items-center gap-2 rounded-full border border-border bg-card py-1.5 pr-1.5 pl-3 shadow-md transition-[border-color,box-shadow] duration-base focus-within:border-brand-border focus-within:shadow-[0_0_0_4px_var(--brand-soft)]">
        <BoltMark className="h-6 w-6 rounded-full" />
        <label htmlFor="ask-cortex" className="sr-only">
          Ask a question about your knowledge base
        </label>
        <input
          id="ask-cortex"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ask anything about your documents…"
          autoComplete="off"
          disabled={isPending}
          className="h-10 min-w-0 flex-1 bg-transparent text-[0.9375rem] text-foreground placeholder:text-faint focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={empty || isPending}
          aria-label={isPending ? "Starting conversation" : "Ask"}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-[background-color,opacity,transform] duration-fast hover:bg-primary-hover active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          {isPending ? <Spinner size="md" /> : <Icon name="ArrowUp" className="h-4 w-4" />}
          <span className="hidden sm:inline">Ask</span>
        </button>
      </div>
      {hint ? <p className="mt-2 px-4 text-xs text-muted-foreground">{hint}</p> : null}
    </form>
  )
}
