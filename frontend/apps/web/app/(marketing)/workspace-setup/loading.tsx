/**
 * Workspace-setup loading state.
 */

"use client"

import { Skeleton } from "@cortex/ui"

import { WorkspaceSetupLayout } from "@/components/onboarding"
import { ProgressIndicator } from "@/components/onboarding/ProgressIndicator"

export default function WorkspaceSetupLoading() {
  return (
    <WorkspaceSetupLayout
      progress={<ProgressIndicator currentStep={1} totalSteps={1} />}
      title="Welcome to Cortex"
      description="Let's set up your workspace. You can change these details later."
    >
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <div className="space-y-1.5">
          <Skeleton variant="text" className="h-4 w-32" />
          <Skeleton variant="rect" className="h-10 w-full" />
        </div>
        <div className="space-y-1.5">
          <Skeleton variant="text" className="h-4 w-32" />
          <Skeleton variant="rect" className="h-10 w-full" />
        </div>
        <Skeleton variant="rect" className="h-10 w-full" />
      </div>
    </WorkspaceSetupLayout>
  )
}
