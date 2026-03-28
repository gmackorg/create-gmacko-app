import { MarketingPage } from "../_components/marketing-page";
import { WaitlistForm } from "../_components/waitlist-form";

export default function ContactPage() {
  return (
    <MarketingPage
      eyebrow="Contact"
      title="Contact support"
      description="Use this form for support requests, product feedback, or launch interest. It writes into the same reviewable queue as the waitlist."
    >
      <div className="max-w-2xl">
        <WaitlistForm
          source="contact"
          redirectTo="/contact"
          title="Send a message"
          description="We will convert this into a reviewable support or interest request."
          buttonLabel="Send message"
        />
      </div>
    </MarketingPage>
  );
}
