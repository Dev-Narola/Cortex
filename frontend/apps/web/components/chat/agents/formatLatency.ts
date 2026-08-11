/**
 * Format a millisecond duration for the trace UI.
 *
 * **F5 Part 3 (Task 17).** Spec: < 1000ms → ``420ms``,
 * >= 1000ms → ``1.2s``. ``null`` → ``"—"`` so an
 * unfinished step reads as "no duration" rather than
 * ``"0ms"``.
 *
 * **Why a helper, not a component.** Multiple
 * components display the latency (AgentTraceStep,
 * the future agent run page header). Keeping the
 * formatter as a pure function lets the test
 * cover the boundary cases (exactly 1000, 999,
 * 1001) without rendering markup.
 *
 * **Decimals.** Two significant digits past the
 * decimal on the seconds path (``1.2s``, not
 * ``1.234s``). The trace is a glance UI, not a
 * benchmarking tool.
 */

export function formatLatency(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—"
  if (ms < 0) return "—"
  if (ms < 1000) return `${Math.round(ms)}ms`
  // Seconds path. One decimal until 10s, then
  // a single integer — ``12s`` is more readable
  // than ``12.3s`` once the duration crosses 10s.
  const seconds = ms / 1000
  if (seconds < 10) return `${seconds.toFixed(1)}s`
  return `${Math.round(seconds)}s`
}
