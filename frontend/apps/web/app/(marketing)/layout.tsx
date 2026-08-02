/**
 * (marketing) route group — statically generated, SEO-driven.
 *
 * Public pages only. The group shares a top nav + footer that
 * differ from the (app) shell. No auth check here.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* TODO: marketing nav with /login + /pricing links */}
      <main className="flex-1">{children}</main>
      {/* TODO: marketing footer */}
    </div>
  )
}
