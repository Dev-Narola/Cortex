import { cn } from "@cortex/ui"

/** Small lightning-bolt mark: Cortex's voice in chat (assistant label, composer). */
export function BoltMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] bg-primary text-primary-foreground",
        className,
      )}
    >
      <svg viewBox="0 0 32 32" className="h-[72%] w-[72%]" fill="currentColor" aria-hidden="true">
        <path
          d="M18.4 5.5 9.6 17.6h6l-1.9 8.9 8.8-12.3h-6l1.9-8.7z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}
