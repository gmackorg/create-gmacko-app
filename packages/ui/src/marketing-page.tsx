import type * as React from "react";

export interface MarketingNavItem {
  readonly label: string;
  readonly href: string;
}

/** Framework-agnostic link renderer; apps pass their router's `Link`. */
export type LinkRenderer = React.ComponentType<{
  href: string;
  className?: string | undefined;
  children: React.ReactNode;
}>;

export const marketingNav: ReadonlyArray<MarketingNavItem> = [
  { label: "Pricing", href: "/pricing" },
  { label: "FAQ", href: "/faq" },
  { label: "Changelog", href: "/changelog" },
  { label: "Contact", href: "/contact" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
];

const Anchor: LinkRenderer = ({ href, className, children }) => (
  <a href={href} className={className}>
    {children}
  </a>
);

/**
 * The public shell: sticky header with the marketing nav, a hero with the
 * page's eyebrow/title/description and its content, and the platform
 * surface aside. Nav links render through `Link` so the app's router owns
 * navigation.
 */
export function MarketingPage(props: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
  nav?: ReadonlyArray<MarketingNavItem>;
  Link?: LinkRenderer;
}) {
  const Link = props.Link ?? Anchor;
  const nav = props.nav ?? marketingNav;

  return (
    <main className="from-background via-background to-muted/20 min-h-screen bg-gradient-to-b">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="border-border/60 bg-background/75 sticky top-4 z-20 rounded-3xl border px-4 py-3 backdrop-blur">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-primary text-xs font-semibold uppercase tracking-[0.28em]">
                {props.eyebrow}
              </p>
              <p className="text-foreground mt-1 text-sm font-medium">
                Gmacko template
              </p>
            </div>
            <nav
              className="flex flex-wrap gap-2 text-sm"
              aria-label="Marketing"
            >
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="border-border hover:bg-muted rounded-full border px-3 py-1.5 transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <section className="grid flex-1 items-center gap-10 py-14 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <p className="text-primary text-sm font-semibold uppercase tracking-[0.3em]">
              {props.eyebrow}
            </p>
            <h1 className="max-w-3xl text-5xl font-black tracking-tight sm:text-6xl">
              {props.title}
            </h1>
            <p className="text-muted-foreground max-w-2xl text-lg leading-8">
              {props.description}
            </p>
            {props.children}
          </div>

          <aside className="border-border bg-card/80 rounded-3xl border p-6 shadow-sm backdrop-blur">
            <div className="space-y-3">
              <p className="text-muted-foreground text-sm font-medium uppercase tracking-[0.24em]">
                Platform surface
              </p>
              <div className="space-y-3 text-sm">
                <p>
                  Public landing, FAQ, changelog, contact, privacy, and terms.
                </p>
                <p>Launch controls, waitlist review, and referrals in admin.</p>
                <p>
                  Optional billing, collaboration, and operator APIs remain
                  modular.
                </p>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

/** A card inside the marketing hero: the same rounded surface every public page uses. */
export function MarketingCard({
  className,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section
      className={[
        "border-border bg-card rounded-3xl border p-6 shadow-sm",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}
