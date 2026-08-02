/**
 * (auth) route group — login, register, accept-invite.
 *
 * Centered single-column shell. No app chrome. Middleware
 * (lib/auth/middleware.ts) sends already-authenticated users
 * to /app.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}
