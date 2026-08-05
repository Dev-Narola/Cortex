/**
 * ProgressIndicator — the "Step 1 of 1" pill at the top
 * of the onboarding flow.
 *
 * **F2 Part 2 (Task 12).** F1+ will add more steps
 * (workspace avatar, team invite). The component takes
 * `currentStep` + `totalSteps` so it scales to that.
 *
 * **Visual.** A small pill with "Step X of Y" + a
 * 4-step progress bar. Subtle, not celebratory — the
 * workspace-setup step is the heaviest one, and the
 * rest are quick.
 *
 * **Why a custom component.** A `<Progress>` primitive
 * would be premature for a single-number state; F1+ will
 * add it when there's a second onboarding step.
 */

import { cn } from "@cortex/ui"

export interface ProgressIndicatorProps {
  currentStep: number
  totalSteps: number
  className?: string
}

export function ProgressIndicator({
  currentStep,
  totalSteps,
  className,
}: ProgressIndicatorProps) {
  const steps = Array.from({ length: totalSteps }, (_, i) => i + 1)
  return (
    <div
      className={cn(
        "flex items-center gap-3 text-xs font-medium text-muted-foreground",
        className,
      )}
      role="group"
      aria-label={`Step ${currentStep} of ${totalSteps}`}
    >
      <div className="flex items-center gap-1.5" aria-hidden="true">
        {steps.map((s) => (
          <span
            key={s}
            className={cn(
              "h-1.5 w-6 rounded-full transition-colors",
              s <= currentStep ? "bg-ember-500" : "bg-muted",
            )}
          />
        ))}
      </div>
      <span>
        Step {currentStep} of {totalSteps}
      </span>
    </div>
  )
}
