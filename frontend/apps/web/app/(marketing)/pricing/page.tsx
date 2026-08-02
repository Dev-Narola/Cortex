/**
 * Pricing page — `/pricing`.
 *
 * Static. Three tiers (Free / Pro / Enterprise) tied to the
 * V9 capacity-planning model (100 / 1,000 / 10,000 tenants).
 */
export default function PricingPage() {
  const tiers = [
    {
      name: "Free",
      price: "$0",
      blurb: "Up to 100 documents, 1 user, community support.",
      cta: "Start free",
    },
    {
      name: "Pro",
      price: "$49/mo",
      blurb: "Up to 10,000 documents, 25 users, knowledge graph, MCP server.",
      cta: "Start trial",
      featured: true,
    },
    {
      name: "Enterprise",
      price: "Custom",
      blurb: "Unlimited everything, multi-region, dedicated support.",
      cta: "Talk to sales",
    },
  ];
  return (
    <div className="mx-auto max-w-6xl px-6 py-24">
      <h1 className="font-display text-4xl font-semibold">Pricing</h1>
      <p className="mt-2 text-muted-foreground">
        Sized to your team. Every plan ships the full Cortex feature set.
      </p>
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={`rounded-xl border p-6 ${
              tier.featured
                ? "border-ember-500 bg-ember-500/5"
                : "border-border bg-background"
            }`}
          >
            <h2 className="font-display text-2xl font-semibold">{tier.name}</h2>
            <p className="mt-2 text-3xl font-semibold">{tier.price}</p>
            <p className="mt-4 text-sm text-muted-foreground">{tier.blurb}</p>
            <a
              href="/register"
              className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-ink-900 px-4 text-sm font-medium text-paper-50 hover:bg-ink-800"
            >
              {tier.cta}
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
