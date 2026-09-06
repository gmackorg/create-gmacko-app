import { createFileRoute } from "@tanstack/react-router";

import {
  MarketingCard,
  MarketingPage,
  marketingHead,
} from "~/components/marketing";

const DESCRIPTION =
  "A starter terms page with enough structure to launch, then refine once the product and billing model are real.";

export const Route = createFileRoute("/terms")({
  head: marketingHead("Terms", DESCRIPTION),
  component: TermsPage,
});

function TermsPage() {
  return (
    <MarketingPage
      eyebrow="Terms"
      title="Terms of service"
      description={DESCRIPTION}
    >
      <MarketingCard>
        <p className="text-muted-foreground text-sm leading-6">
          Replace this with your product-specific terms, subscription terms, and
          acceptable use policy before public release.
        </p>
      </MarketingCard>
    </MarketingPage>
  );
}
