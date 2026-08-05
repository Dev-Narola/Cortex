/**
 * Register — `/register`.
 *
 * **F2 Part 1 (Tasks 1 + 7).** Public auth route.
 * Wraps the RHF + Zod form in `AuthLayout` for the
 * centered card chrome.
 *
 * **Already-authenticated users.** Pushed to /app by
 * the surrounding `ProtectedRoute` (reverse mode).
 */

import Link from "next/link"

import { AuthLayout, ProtectedRoute, RegisterForm } from "@/components/auth"

export const dynamic = "force-dynamic"

export default function RegisterPage() {
  return (
    <ProtectedRoute redirectIfAuthenticatedTo="/app">
      <AuthLayout
        title="Create your account"
        description="Start exploring Cortex in under a minute."
        backHref="/"
        footer={
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </p>
        }
      >
        <RegisterForm />
      </AuthLayout>
    </ProtectedRoute>
  )
}
