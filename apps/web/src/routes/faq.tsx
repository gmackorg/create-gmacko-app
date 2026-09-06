import { createFileRoute } from "@tanstack/react-router";

import {
  MarketingCard,
  MarketingPage,
  marketingHead,
} from "~/components/marketing";

const DESCRIPTION =
  "A lightweight FAQ page keeps the public shell useful before the team adds a fuller help center.";

export const Route = createFileRoute("/faq")({
  head: marketingHead("FAQ", DESCRIPTION),
  component: FaqPage,
});

function FaqPage() {
  return (
    <MarketingPage
      eyebrow="FAQ"
      title="Frequently asked questions"
      description={DESCRIPTION}
    >
      <div className="space-y-4">
        <MarketingCard>
          <h2 className="font-semibold">What ships in v1?</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            The template starts with workspace bootstrap, public launch
            controls, support pages, and optional SaaS layers.
          </p>
        </MarketingCard>
        <MarketingCard>
          <h2 className="font-semibold">Can I keep signup closed?</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Yes. The admin settings can toggle signup and maintenance mode while
            the waitlist collects interest.
          </p>
        </MarketingCard>
      </div>
    </MarketingPage>
  );
}
