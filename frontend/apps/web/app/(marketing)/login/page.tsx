/**
 * Login — `/login`.
 *
 * **F2 Part 1 (Task 1 + 6).** Public auth route. The form
 * is a thin wrapper around `LoginForm` (which owns the
 * RHF + Zod + API call). This page is the Suspense
 * boundary (required because `useSearchParams()` opts
 * the inner form out of static rendering).
 *
 * **Layout.** Uses `AuthLayout` from `components/auth/`
 * for the centered card chrome. Never duplicate the
 * layout in the page.
 *
 * **Already-authenticated users.** `ProtectedRoute` in
 * reverse — if you're already signed in and you land
 * on /login, you go to /app.
 */

import Link from "next/link"
import { Suspense } from "react"

import { AuthLayout, LoginForm, ProtectedRoute } from "@/components/auth"

export const dynamic = "force-dynamic"

export default function LoginPage() {
  return (
    <ProtectedRoute redirectIfAuthenticatedTo="/app">
      <AuthLayout
        title="Sign in to Cortex"
        description="Use your work email and workspace slug."
        backHref="/"
        footer={
          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link
              href={"/register" as never}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Create one
            </Link>
          </p>
        }
      >
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </AuthLayout>
    </ProtectedRoute>
  )
}
