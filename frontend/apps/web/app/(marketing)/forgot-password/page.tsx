/**
 * Forgot Password — `/forgot-password`.
 *
 * **F2 Part 1 (Task 1).** Email-only form. The
 * success state replaces the form with a
 * confirmation panel.
 */

import Link from "next/link"

import { AuthLayout, ForgotPasswordForm } from "@/components/auth"

export const dynamic = "force-dynamic"

export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      title="Reset your password"
      description="Enter your email and we'll send you a reset link."
      backHref="/login"
      footer={
        <p className="text-center text-sm text-muted-foreground">
          Remembered it?{" "}
          <Link
            href="/login"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      }
    >
      <ForgotPasswordForm />
    </AuthLayout>
  )
}
