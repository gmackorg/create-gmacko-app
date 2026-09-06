import { createFileRoute } from "@tanstack/react-router";

import {
  MarketingCard,
  MarketingPage,
  marketingHead,
} from "~/components/marketing";

const DESCRIPTION =
  "Start with a free workspace, then layer plans and limits when the product is ready. Billing and metering remain optional scaffold layers.";

export const Route = createFileRoute("/pricing")({
  head: marketingHead("Pricing", DESCRIPTION),
  component: PricingPage,
});

function PricingPage() {
  return (
    <MarketingPage
      eyebrow="Pricing"
      title="Simple pricing for the first launch"
      description={DESCRIPTION}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <MarketingCard>
          <h2 className="text-xl font-semibold">Free</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            One workspace, core product access, and the standard launch shell.
          </p>
        </MarketingCard>
        <MarketingCard>
          <h2 className="text-xl font-semibold">Pro</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Add limits, metering, collaboration, and billing controls when the
            product needs them.
          </p>
        </MarketingCard>
      </div>
    </MarketingPage>
  );
}
