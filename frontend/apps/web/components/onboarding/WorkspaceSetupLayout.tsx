/**
 * WorkspaceSetupLayout — the chrome for the onboarding
 * flow.
 *
 * **F2 Part 2 (Task 12).** Wraps the workspace-setup
 * page in a multi-column hero (illustration on one side,
 * form on the other) with a progress indicator up top.
 *
 * **Stays in the marketing theme.** Per the spec: "Use
 * the existing marketing theme. Do not switch themes yet."
 * The light palette + the centered login-style layout
 * reinforce the "you're still on the public site" feeling.
 * The theme transition to dark fires AFTER the workspace
 * is created (Task 18), not here.
 *
 * **Slot composition.**
 *   - `progress` — the step indicator (1/3, 2/3, 3/3).
 *   - `children` — the form.
 *   - `footer` — secondary links (e.g. "Sign out").
 *
 * **Single source of truth for the onboarding chrome.**
 * The page (`/workspace-setup`) renders this layout once;
 * the form is the page's only child. Future onboarding
 * steps (workspace avatar, team invite) compose into the
 * same layout.
 */

import Link from "next/link"
import type { ReactNode } from "react"

import { Logo, Text } from "@cortex/ui"

export interface WorkspaceSetupLayoutProps {
  progress: ReactNode
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}

export function WorkspaceSetupLayout({
  progress,
  title,
  description,
  children,
  footer,
}: WorkspaceSetupLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top bar — logo + progress + secondary link. */}
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <Link
          href={"/" as never}
          aria-label="Cortex home"
          className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Logo size="md" />
        </Link>
        <div className="flex flex-1 items-center justify-center px-8">{progress}</div>
        <Link
          href={"/login" as never}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Sign out
        </Link>
      </header>

      {/* Hero — illustration on one side, form on the other. */}
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="grid w-full max-w-5xl gap-12 md:grid-cols-2 md:items-center">
          <section className="hidden flex-col gap-4 md:flex">
            {/* What happens after setup — the real next steps, not decoration. */}
            <ol className="space-y-3 rounded-3xl border border-brand-border bg-brand-soft p-6">
              {[
                ["Name your workspace", "Your documents, agents and team live here."],
                ["Upload documents", "PDF, Markdown, text, or a web page. Indexed in seconds."],
                ["Ask with citations", "Every answer links back to the passage it came from."],
              ].map(([step, hint], i) => (
                <li key={step} className="flex items-start gap-3 rounded-2xl bg-card p-4 shadow-xs">
                  <span className="tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {i + 1}
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-foreground">{step}</span>
                    <span className="block text-sm text-muted-foreground">{hint}</span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="space-y-1">
              <h2 className="font-display text-xl font-medium tracking-tight text-foreground">
                Build your knowledge graph
              </h2>
              <Text tone="muted" size="sm">
                A workspace is where your documents, agents, and team live together. You can invite
                teammates after the setup.
              </Text>
            </div>
          </section>

          <section className="mx-auto w-full max-w-md space-y-4">
            <div className="space-y-1">
              <h1 className="font-display text-[1.875rem] font-medium leading-tight tracking-[-0.02em] text-foreground">
                {title}
              </h1>
              {description ? (
                <Text tone="muted" size="sm">
                  {description}
                </Text>
              ) : null}
            </div>
            {children}
            {footer ? (
              <div className="pt-2 text-center text-sm text-muted-foreground">{footer}</div>
            ) : null}
          </section>
        </div>
      </main>
    </div>
  )
}
