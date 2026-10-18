import { redirect } from "next/navigation"

// Cortex has no email delivery: resets are links issued by a workspace
// owner/admin. /reset-password explains that when opened without a token.
export default function ForgotPasswordPage() {
  redirect("/reset-password")
}
