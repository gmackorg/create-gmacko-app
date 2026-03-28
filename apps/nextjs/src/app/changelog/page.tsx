import { MarketingPage } from "../_components/marketing-page";

export default function ChangelogPage() {
  return (
    <MarketingPage
      eyebrow="Changelog"
      title="What changed"
      description="A place for public updates, release notes, and the kind of lightweight product history users expect."
    >
      <div className="space-y-4">
        <section className="border-border bg-card rounded-3xl border p-6 shadow-sm">
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
        </section>
      </div>
    </MarketingPage>
  );
}
