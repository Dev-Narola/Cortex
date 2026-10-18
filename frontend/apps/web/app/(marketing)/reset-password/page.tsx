import Link from "next/link"

import { AuthLayout, ResetPasswordForm } from "@/components/auth"

export const metadata = { title: "Reset password" }

export default async function ResetPasswordPage({
  searchParams,
}: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  if (typeof token === "string" && token.length > 0) {
    return (
      <AuthLayout title="Set a new password" backHref="/login">
        <ResetPasswordForm token={token} />
      </AuthLayout>
    )
  }
  return (
    <AuthLayout title="Reset your password" backHref="/login">
      <div className="space-y-4 text-sm text-muted-foreground">
        <p>
          Reset links are issued by your workspace owner or an admin from <strong>Team</strong>. Ask
          them for a link; it works once and expires after an hour.
        </p>
        <Link
          href="/login"
          className="inline-block font-medium text-foreground underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    </AuthLayout>
  )
}
