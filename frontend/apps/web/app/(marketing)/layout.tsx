/**
 * (marketing) layout — public pages (landing, pricing, auth, onboarding).
 * Follows the same theme as the app (dark by default, user-switchable);
 * the old forced-light script is gone so a theme choice persists everywhere.
 *
 * **No business logic.** Layout only.
 */

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-ambient text-foreground">
      <main id="main" className="flex-1">
        {children}
      </main>
    </div>
  )
}
