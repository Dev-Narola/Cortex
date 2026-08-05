/**
 * Reset Password — `/reset-password?token=...`.
 *
 * **F2 Part 1 (Task 1).** Sets a new password using
 * the token from the email link. The form reads
 * the token from the URL query string.
 *
 * **Suspense.** `useSearchParams()` requires a
 * Suspense boundary around the form.
 */

import Link from "next/link"
import { Suspense } from "react"

import { AuthLayout, ResetPasswordForm } from "@/components/auth"

export const dynamic = "force-dynamic"

export default function ResetPasswordPage() {
  return (
    <AuthLayout
      title="Set a new password"
      description="Pick something you haven't used before."
      backHref="/login"
      footer={
        <p className="text-center text-sm text-muted-foreground">
          Didn&apos;t request this?{" "}
          <Link
            href="/login"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      }
    >
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </AuthLayout>
  )
}
