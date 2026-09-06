import { createFileRoute } from "@tanstack/react-router";

import {
  MarketingCard,
  MarketingPage,
  marketingHead,
} from "~/components/marketing";

const DESCRIPTION =
  "Keep the first-pass policy simple and editable. Add provider-specific retention and subprocessors once the app picks them.";

export const Route = createFileRoute("/privacy")({
  head: marketingHead("Privacy", DESCRIPTION),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <MarketingPage
      eyebrow="Privacy"
      title="Privacy policy"
      description={DESCRIPTION}
    >
      <MarketingCard>
        <p className="text-muted-foreground text-sm leading-6">
          This template ships with a lightweight privacy page so teams can fill
          in their own data collection, retention, and contact details before
          launch.
        </p>
      </MarketingCard>
    </MarketingPage>
  );
}
