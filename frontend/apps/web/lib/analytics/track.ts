/**
 * Analytics event helpers — the public API the F10-Part 4
 * call sites use.
 *
 * **F10-Part 4 (Tasks 10, 11, 12, 13, 14, 15).** Every
 * marketing CTA, demo event, auth event, workspace event,
 * and product-adoption event calls one of the helpers in
 * this file. The helpers dispatch to the bound
 * `AnalyticsClient` (default: noop).
 *
 * **The catalog is the source of truth.** Every event
 * name is defined as a const string here. A typo or a
 * new event must be added to this file (and the
 * `analytics-events.md` catalog) before any call site
 * can use it. This is a single-file lock against
 * drift.
 */
import { getAnalyticsClient } from "./provider"
import type { AnalyticsProperties } from "./provider/client"

// ----------------------------------------------------------------
// Marketing events (light theme, no auth)
// ----------------------------------------------------------------

/** First paint of `/` (the marketing home). */
export const MARKETING_LANDING_PAGE_VIEW = "landing_page_view" as const
/** First paint of `/pricing`. */
export const MARKETING_PRICING_PAGE_VIEW = "pricing_page_view" as const
/** Any CTA on the marketing site clicked. */
export const MARKETING_CTA_CLICKED = "marketing_cta_clicked" as const
/** User opens the F8 live interactive demo. */
export const LIVE_DEMO_STARTED = "live_demo_started" as const
/** User submits a question in the live demo. */
export const LIVE_DEMO_QUESTION_SUBMITTED = "live_demo_question_submitted" as const
/** The demo answer streams to completion. */
export const LIVE_DEMO_COMPLETED = "live_demo_completed" as const
/** User opens a citation's source panel. */
export const DEMO_SOURCE_VIEWED = "demo_source_viewed" as const

// ----------------------------------------------------------------
// Auth events (light theme, no auth)
// ----------------------------------------------------------------

/** User submits the signup form. */
export const SIGNUP_STARTED = "signup_started" as const
/** Signup succeeds server-side. */
export const SIGNUP_COMPLETED = "signup_completed" as const
/** Signup fails with a server-validated error. */
export const SIGNUP_FAILED = "signup_failed" as const
/** User submits the login form. */
export const LOGIN_STARTED = "login_started" as const
/** Login succeeds server-side. */
export const LOGIN_COMPLETED = "login_completed" as const
/** Login fails with a server-validated error. */
export const LOGIN_FAILED = "login_failed" as const
/** User explicitly logs out. */
export const LOGOUT_COMPLETED = "logout_completed" as const

// ----------------------------------------------------------------
// Workspace events
// ----------------------------------------------------------------

/** User opens the workspace-setup screen. */
export const WORKSPACE_SETUP_VIEWED = "workspace_setup_viewed" as const
/** Workspace is successfully created server-side. */
export const WORKSPACE_CREATED = "workspace_created" as const

// ----------------------------------------------------------------
// Product adoption events
// ----------------------------------------------------------------

/** The first successful document upload per user. */
export const FIRST_DOCUMENT_UPLOADED = "first_document_uploaded" as const
/** Any subsequent document upload (after the first). */
export const DOCUMENT_UPLOADED = "document_uploaded" as const
/** The first chat question per user (per workspace). */
export const FIRST_CHAT_QUESTION = "first_chat_question" as const
/** Any subsequent chat question. */
export const CHAT_QUESTION_SENT = "chat_question_sent" as const
/** An agent run completes. */
export const AGENT_RUN_COMPLETED = "agent_run_completed" as const
/** User opens `/app/graph`. */
export const KNOWLEDGE_GRAPH_VIEWED = "knowledge_graph_viewed" as const

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

/**
 * Fire a custom event. Dispatched to the bound
 * `AnalyticsClient` (default: noop).
 *
 * **The provider is responsible for validating the
 * event name + properties against the catalog.** This
 * function does not validate; the abstraction is
 * provider-agnostic and the noop default accepts
 * anything.
 */
export function track(
  event: string,
  properties?: AnalyticsProperties,
): void {
  getAnalyticsClient().track(event, properties)
}

/**
 * Identify a user after authentication. The argument
 * is a stable, opaque user ID (typically a UUID), NOT
 * the user's email.
 */
export function identify(
  userId: string,
  traits?: AnalyticsProperties,
): void {
  getAnalyticsClient().identify(userId, traits)
}

/**
 * Track a page view. Called by the router on every
 * navigation. The `path` argument is the current URL
 * path; the provider can decide whether to include
 * the query string.
 */
export function page(
  path: string,
  properties?: AnalyticsProperties,
): void {
  getAnalyticsClient().page(path, properties)
}

/**
 * Reset the current user. Called on logout. The
 * provider must forget the current user ID + traits.
 */
export function reset(): void {
  getAnalyticsClient().reset()
}
