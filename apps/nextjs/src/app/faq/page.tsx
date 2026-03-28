import { MarketingPage } from "../_components/marketing-page";

export default function FaqPage() {
  return (
    <MarketingPage
      eyebrow="FAQ"
      title="Frequently asked questions"
      description="A lightweight FAQ page keeps the public shell useful before the team adds a fuller help center."
    >
      <div className="space-y-4">
        <section className="border-border bg-card rounded-3xl border p-6 shadow-sm">
          <h2 className="font-semibold">What ships in v1?</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            The template starts with workspace bootstrap, public launch
            controls, support pages, and optional SaaS layers.
          </p>
        </section>
        <section className="border-border bg-card rounded-3xl border p-6 shadow-sm">
          <h2 className="font-semibold">Can I keep signup closed?</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Yes. The admin settings can toggle signup and maintenance mode while
            the waitlist collects interest.
          </p>
        </section>
      </div>
    </MarketingPage>
  );
}
