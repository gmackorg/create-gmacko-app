import { MarketingPage } from "../_components/marketing-page";

export default function TermsPage() {
  return (
    <MarketingPage
      eyebrow="Terms"
      title="Terms of service"
      description="A starter terms page with enough structure to launch, then refine once the product and billing model are real."
    >
      <div className="border-border bg-card rounded-3xl border p-6 shadow-sm">
        <p className="text-muted-foreground text-sm leading-6">
          Replace this with your product-specific terms, subscription terms, and
          acceptable use policy before public release.
        </p>
      </div>
    </MarketingPage>
  );
}
