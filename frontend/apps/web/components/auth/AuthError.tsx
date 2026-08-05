/**
 * `AuthError` — consistent, accessible error message banner.
 *
 * **F2 Part 3 (Task 26).**
 *
 * Supports:
 *   - Invalid Credentials ("invalid_credentials")
 *   - Duplicate Email ("duplicate_email")
 *   - Network Error ("network_error")
 *   - Server Error ("server_error")
 *   - Refresh Failure ("refresh_failed")
 *   - Custom error string
 *
 * Replaces browser alerts with consistent, high-contrast, accessible UI.
 */

"use client"

import { AlertCircle } from "lucide-react"

export type AuthErrorType =
  | "invalid_credentials"
  | "duplicate_email"
  | "network_error"
  | "server_error"
  | "refresh_failed"
  | string

export interface AuthErrorProps {
  error: AuthErrorType | null | undefined
  /** Optional custom message override. */
  message?: string
  className?: string
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "Invalid email, password, or workspace.",
  duplicate_email: "An account with this email address already exists.",
  network_error: "Network error. Please check your internet connection.",
  server_error: "An unexpected server error occurred. Please try again later.",
  refresh_failed: "Your session has expired. Please sign in again.",
}

export function AuthError({ error, message, className = "" }: AuthErrorProps) {
  if (!error && !message) return null

  const displayMessage =
    message ??
    (typeof error === "string" && ERROR_MESSAGES[error] ? ERROR_MESSAGES[error] : String(error))

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive ${className}`}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{displayMessage}</span>
    </div>
  )
}
