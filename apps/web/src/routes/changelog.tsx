import { createFileRoute } from "@tanstack/react-router";

import {
  MarketingCard,
  MarketingPage,
  marketingHead,
} from "~/components/marketing";

const DESCRIPTION =
  "A place for public updates, release notes, and the kind of lightweight product history users expect.";

export const Route = createFileRoute("/changelog")({
  head: marketingHead("Changelog", DESCRIPTION),
  component: ChangelogPage,
});

function ChangelogPage() {
  return (
    <MarketingPage
      eyebrow="Changelog"
      title="What changed"
      description={DESCRIPTION}
    >
      <div className="space-y-4">
        <MarketingCard>
          <p className="text-primary text-xs font-semibold uppercase tracking-[0.24em]">
            Latest
          </p>
          <h2 className="mt-2 font-semibold">
            Launch controls and public shell
          </h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Added a marketing homepage, support content, and admin toggles for
            maintenance mode and signup behavior.
          </p>
        </MarketingCard>
      </div>
    </MarketingPage>
  );
}
