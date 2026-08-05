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
import { type ReactNode } from "react"

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
      <header className="flex items-center justify-between border-b border-border bg-background/80 px-6 py-4 backdrop-blur sm:px-10">
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
            <div
              className="relative aspect-square w-full overflow-hidden rounded-2xl border border-border bg-muted/40"
              aria-hidden="true"
            >
              {/* Workspace illustration placeholder — an ambient
                  gradient mesh that hints at "the network lights up
                  when your documents connect". F3+ replaces this
                  with a real SVG / canvas illustration. */}
              <div className="absolute inset-0 bg-gradient-to-br from-ember-100 via-paper-50 to-volt-100" />
              <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-ember-300 to-volt-300 opacity-50 blur-2xl" />
            </div>
            <div className="space-y-1">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
                Build your knowledge graph
              </h2>
              <Text tone="muted" size="sm">
                A workspace is where your documents, agents, and team live
                together. You can invite teammates after the setup.
              </Text>
            </div>
          </section>

          <section className="mx-auto w-full max-w-md space-y-4">
            <div className="space-y-1">
              <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
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
              <div className="pt-2 text-center text-sm text-muted-foreground">
                {footer}
              </div>
            ) : null}
          </section>
        </div>
      </main>
    </div>
  )
}
