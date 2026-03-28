import { MarketingPage } from "../_components/marketing-page";

export default function PricingPage() {
  return (
    <MarketingPage
      eyebrow="Pricing"
      title="Simple pricing for the first launch"
      description="Start with a free workspace, then layer plans and limits when the product is ready. Billing and metering remain optional scaffold layers."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <section className="border-border bg-card rounded-3xl border p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Free</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            One workspace, core product access, and the standard launch shell.
          </p>
        </section>
        <section className="border-border bg-card rounded-3xl border p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Pro</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Add limits, metering, collaboration, and billing controls when the
            product needs them.
          </p>
        </section>
      </div>
    </MarketingPage>
  );
}
