import { createFileRoute } from "@tanstack/react-router";

import { MarketingPage, marketingHead } from "~/components/marketing";
import { WaitlistForm } from "~/components/waitlist-form";

const DESCRIPTION =
  "Use this form for support requests, product feedback, or launch interest. It writes into the same reviewable queue as the waitlist.";

export const Route = createFileRoute("/contact")({
  head: marketingHead("Contact", DESCRIPTION),
  component: ContactPage,
});

function ContactPage() {
  return (
    <MarketingPage
      eyebrow="Contact"
      title="Contact support"
      description={DESCRIPTION}
    >
      <div className="max-w-2xl">
        <WaitlistForm
          source="contact"
          title="Send a message"
          description="We will convert this into a reviewable support or interest request."
          buttonLabel="Send message"
        />
      </div>
    </MarketingPage>
  );
}
