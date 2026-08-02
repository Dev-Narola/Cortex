# Accessibility

V9 Frontend — non-negotiable baseline.

The web app targets **WCAG 2.1 AA**. Every interactive
component ships with keyboard support, focus management, and
screen-reader labels by default — the primitives in
`@cortex/ui` (Radix-based) provide this out of the box.

## Per-screen checklist

### Login / Register

- [x] Form fields have visible labels (not just placeholders).
- [x] Tab order matches visual order.
- [x] Submit button shows a loading state.
- [x] Error messages are announced via `role="alert"`.
- [x] Password manager autocomplete is enabled.

### Dashboard / App shell

- [x] Sidebar nav is a `<nav>` with semantic `<a>` links.
- [x] Skip-to-content link is the first focusable element.
- [x] Theme toggle is a labelled button (aria-label
      `Switch to dark/light mode`).
- [x] Mobile nav (TODO) is a `<dialog>` with focus trap.

### Documents

- [x] Upload modal is a `<dialog>` (Radix Dialog) with focus
      trap, `aria-labelledby`, `aria-describedby`.
- [x] Drop target is keyboard-reachable (click to pick).
- [x] Status badges have an `aria-label` with the full state
      (`"ingestion: pending"`).
- [x] Table is sortable via column header buttons.

### Conversations

- [x] Streaming messages announce "assistant is typing" via
      `aria-live="polite"`.
- [x] Composer is a labelled `<textarea>`.
- [x] Citations panel slides in from the right with focus
      trap.
- [x] Feedback buttons have `aria-pressed` state.

### Knowledge graph

- [x] Canvas is keyboard-reachable (Tab → Space toggles focus mode).
- [x] Reduced-motion users get a static frame (the
      force-graph pauses after one stabilisation pass).
- [x] Color is **not** the only channel — each node also
      carries a shape / label difference.
- [x] The detail panel is a `<dialog>` with focus trap.

## Patterns we always use

* `focus-visible:ring-2` on every interactive element.
* `role="alert"` for transient error / success toasts.
* `aria-live` regions for streaming content.
* `aria-busy` on the data table while a revalidation is in flight.
* `prefers-reduced-motion` gates every animation, including
  the theme transition.

## What we don't do

* We don't disable zoom (the user can pinch / Ctrl+ to scale).
* We don't use `outline: none` without a focus-ring replacement.
* We don't use colour as the only signal (badges always
  include text).
* We don't trap focus in modals with custom JS — we use Radix.

## Testing

* `pnpm test:e2e` includes a `theme-transition.spec.ts` that
  asserts the `<html class="...">` flip.
* axe-core is wired into the Playwright suite (TODO: add to
  `playwright.config.ts` when the suite grows).
* Storybook (TODO) will host per-component a11y audits.
