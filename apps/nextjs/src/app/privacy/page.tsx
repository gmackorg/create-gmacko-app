import { MarketingPage } from "../_components/marketing-page";

export default function PrivacyPage() {
  return (
    <MarketingPage
      eyebrow="Privacy"
      title="Privacy policy"
      description="Keep the first-pass policy simple and editable. Add provider-specific retention and subprocessors once the app picks them."
    >
      <div className="border-border bg-card rounded-3xl border p-6 shadow-sm">
        <p className="text-muted-foreground text-sm leading-6">
          This template ships with a lightweight privacy page so teams can fill
          in their own data collection, retention, and contact details before
          launch.
        </p>
      </div>
    </MarketingPage>
  );
}
