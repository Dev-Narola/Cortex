/**
 * AgentsView — list, create, run and delete agents (`/api/v1/agents`).
 *
 * Runs are synchronous on the backend: the dialog waits for the loop to
 * finish, shows the answer and its stats, and links to the run inspector
 * (`/app/agents/[agentId]/runs/[runId]`) for the step-by-step trace.
 */

"use client"

import Link from "next/link"
import { type FormEvent, useState } from "react"

import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Icon,
  Input,
  Label,
  PageHeader,
  Skeleton,
  Textarea,
  toast,
} from "@cortex/ui"

import { useAgents, useCreateAgent, useDeleteAgent, useExecuteAgent } from "@/hooks/agents"
import { toFrontendError } from "@/lib/http/errors"
import { formatRelative } from "@/lib/utils/date"
import type { Agent } from "@/services/agents"

// The model the production server is configured with; runs always use the
// server's configured model (see FRONTEND_API_GAPS.md).
const DEFAULT_MODEL = "openai/gpt-oss-20b"

function CreateAgentDialog({
  open,
  onOpenChange,
}: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateAgent()
  const [form, setForm] = useState({
    name: "",
    description: "",
    system_prompt: "",
    model: DEFAULT_MODEL,
  })
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value })

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    try {
      await create.mutateAsync({
        name: form.name.trim(),
        description: form.description.trim(),
        system_prompt: form.system_prompt.trim(),
        model: form.model.trim(),
      })
      toast({ title: "Agent created", description: form.name.trim() })
      setForm({ name: "", description: "", system_prompt: "", model: DEFAULT_MODEL })
      onOpenChange(false)
    } catch (err) {
      toast({
        title: "Couldn't create the agent",
        description: toFrontendError(err).message,
        variant: "destructive",
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>New agent</DialogTitle>
          <DialogDescription>
            An agent answers with your knowledge base as its tool, looping until it has an answer or
            hits its limits.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" id="create-agent-form">
          <div className="space-y-1.5">
            <Label htmlFor="agent-name">Name</Label>
            <Input
              id="agent-name"
              required
              maxLength={255}
              value={form.name}
              onChange={set("name")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agent-description">Description</Label>
            <Input
              id="agent-description"
              maxLength={2000}
              value={form.description}
              onChange={set("description")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agent-prompt">Instructions (system prompt)</Label>
            <Textarea
              id="agent-prompt"
              required
              rows={5}
              value={form.system_prompt}
              onChange={set("system_prompt")}
              placeholder="You are a support analyst. Answer only from the knowledge base and cite sources."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agent-model">Model label</Label>
            <Input
              id="agent-model"
              required
              maxLength={255}
              value={form.model}
              onChange={set("model")}
              className="font-mono"
            />
            <p className="text-xs text-faint">
              Stored on the agent. Runs use the model configured on the server.
            </p>
          </div>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="create-agent-form" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create agent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RunAgentDialog({ agent, onClose }: { agent: Agent | null; onClose: () => void }) {
  const run = useExecuteAgent()
  const [message, setMessage] = useState("")

  function close() {
    run.reset()
    setMessage("")
    onClose()
  }

  return (
    <Dialog open={!!agent} onOpenChange={(o) => (o ? null : close())}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Run {agent?.name}</DialogTitle>
          <DialogDescription>
            Runs can take up to a minute while the agent searches and reasons.
          </DialogDescription>
        </DialogHeader>
        <form
          id="run-agent-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (agent && message.trim()) run.mutate({ id: agent.id, message: message.trim() })
          }}
        >
          <Label htmlFor="agent-message" className="sr-only">
            Task
          </Label>
          <Textarea
            id="agent-message"
            required
            rows={3}
            maxLength={16384}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What should the agent do?"
            disabled={run.isPending}
          />
        </form>
        <div aria-live="polite">
          {run.isPending ? (
            <output className="space-y-2" aria-label="Agent running">
              <Skeleton size="h-4 w-3/4" />
              <Skeleton size="h-4 w-2/3" />
              <Skeleton size="h-4 w-1/2" />
            </output>
          ) : run.isError ? (
            <p className="text-sm text-error">{toFrontendError(run.error).message}</p>
          ) : run.data ? (
            <div className="space-y-3">
              <div className="max-h-72 overflow-y-auto rounded-xl bg-muted p-4 text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                {run.data.result || "The agent finished without an answer."}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>Status: {run.data.status}</span>
                <span className="tabular">{run.data.iterations} iterations</span>
                <span className="tabular">{run.data.tool_calls} tool calls</span>
                {run.data.stop_reason ? <span>Stopped: {run.data.stop_reason}</span> : null}
                {agent ? (
                  <Link
                    href={`/app/agents/${agent.id}/runs/${run.data.run_id}` as never}
                    className="ml-auto text-brand-ink hover:underline"
                  >
                    Inspect run
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Close
          </Button>
          <Button type="submit" form="run-agent-form" disabled={run.isPending || !message.trim()}>
            {run.isPending ? "Running…" : "Run"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteAgentDialog({ agent, onClose }: { agent: Agent | null; onClose: () => void }) {
  const del = useDeleteAgent()
  return (
    <Dialog open={!!agent} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Delete {agent?.name}?</DialogTitle>
          <DialogDescription>
            The agent is removed for everyone in this workspace. Past runs stay in the audit log.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={del.isPending}
            onClick={async () => {
              if (!agent) return
              try {
                await del.mutateAsync(agent.id)
                onClose()
              } catch (err) {
                toast({
                  title: "Couldn't delete the agent",
                  description: toFrontendError(err).message,
                  variant: "destructive",
                })
              }
            }}
          >
            {del.isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function AgentsView() {
  const agents = useAgents()
  const [creating, setCreating] = useState(false)
  const [running, setRunning] = useState<Agent | null>(null)
  const [deleting, setDeleting] = useState<Agent | null>(null)
  const items = agents.data?.items ?? []

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        title="Agents"
        description="Multi-step agents that search your knowledge base to complete a task."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Icon name="Plus" className="h-4 w-4" aria-hidden />
            New agent
          </Button>
        }
      />

      {agents.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} size="h-44 w-full" className="rounded-2xl" />
          ))}
        </div>
      ) : agents.isError ? (
        <Card radius="xl" className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">Couldn't load agents.</p>
          <Button variant="outline" size="sm" onClick={() => void agents.refetch()}>
            Retry
          </Button>
        </Card>
      ) : items.length === 0 ? (
        <EmptyState
          icon="Bot"
          title="No agents yet"
          description="Create an agent with instructions for a recurring task, then run it against your knowledge base."
          actionLabel="New agent"
          onAction={() => setCreating(true)}
        />
      ) : (
        <ul className="stagger-rise grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((a) => (
            <li key={a.id}>
              <Card
                variant="interactive"
                radius="xl"
                className="flex h-full cursor-default flex-col gap-3"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand"
                    aria-hidden
                  >
                    <Icon name="Bot" className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-display text-base font-semibold text-foreground">
                      {a.name}
                    </h2>
                    <p className="truncate font-mono text-xs text-faint">{a.model}</p>
                  </div>
                  <Badge
                    variant={a.status === "active" ? "success" : "secondary"}
                    className="capitalize"
                  >
                    {a.status}
                  </Badge>
                </div>
                <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">
                  {a.description || a.system_prompt}
                </p>
                <div className="mt-auto flex items-center gap-2 border-t border-divider pt-3">
                  <span className="text-xs text-faint">Updated {formatRelative(a.updated_at)}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    aria-label={`Delete ${a.name}`}
                    onClick={() => setDeleting(a)}
                  >
                    <Icon name="Trash2" className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button size="sm" onClick={() => setRunning(a)} disabled={a.status !== "active"}>
                    <Icon name="Play" className="h-3.5 w-3.5" aria-hidden />
                    Run
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <CreateAgentDialog open={creating} onOpenChange={setCreating} />
      <RunAgentDialog agent={running} onClose={() => setRunning(null)} />
      <DeleteAgentDialog agent={deleting} onClose={() => setDeleting(null)} />
    </div>
  )
}
