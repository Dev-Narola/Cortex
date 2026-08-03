/**
 * `toast-provider` — central notification system.
 *
 * **F0 scope (Task 46).** The actual Radix-backed Toast primitive
 * lives in `@cortex/ui` (it's a shadcn primitive that depends on
 * `@radix-ui/react-toast`). This file is the *app-side* surface
 * for it — the place where every feature's toast call lands.
 *
 * **Why a re-export + barrel?** Two reasons:
 *   1. **Single import path.** Feature code does
 *      `import { useToast, toast } from "@/components/toast-provider"`,
 *      not `import { ... } from "@cortex/ui"`. The day we want
 *      to wrap toasts with our own telemetry or redaction, the
 *      change happens here, not in 30 feature files.
 *   2. **Spec compliance.** The spec calls for a
 *      `components/toast-provider.tsx`; the underlying Radix
 *      primitive is still in `@cortex/ui` per the design-system
 *      rule that primitives live in the package.
 *
 * The structural primitives (`Toast`, `ToastAction`, `ToastTitle`,
 * `ToastDescription`, `ToastClose`, `ToastViewport`) are
 * imported directly from `@cortex/ui` — re-exporting forwardRef
 * components triggers `isolatedModules` "type-only" false
 * positives, so the barrel here is intentionally narrow.
 *
 * **Future:** this is where the "Upload success / Error / Warning
 * / Streaming notification" presets will live. For now, callers
 * use the raw `toast()` and shape their own copy.
 */

"use client"

import { ToastProvider as UiToastProvider, toast, useToast } from "@cortex/ui"

export { toast, useToast }

/**
 * Re-exports the package's `ToastProvider` under the same name
 * so the providers tree can read like a sentence:
 *   `<ThemeProvider><QueryProvider><ToastProvider>...`
 */
export const ToastProvider = UiToastProvider
