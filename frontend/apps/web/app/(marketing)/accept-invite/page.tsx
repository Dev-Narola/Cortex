import { AcceptInviteForm, AuthLayout } from "@/components/auth"

export const metadata = { title: "Accept invitation" }

export default async function AcceptInvitePage({
  searchParams,
}: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  return (
    <AuthLayout
      title="Join your team on Cortex"
      description="Set a password to accept the invitation."
      backHref="/"
    >
      <AcceptInviteForm token={typeof token === "string" ? token : ""} />
    </AuthLayout>
  )
}
