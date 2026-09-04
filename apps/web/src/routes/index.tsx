import { LaunchBanner } from "@gmacko/ui/launch-banner";
import { MarketingCard } from "@gmacko/ui/marketing-page";
import { toast } from "@gmacko/ui/toast";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useEffect } from "react";

import { AuthShowcase } from "~/components/auth-showcase";
import { BootstrapScreen } from "~/components/bootstrap";
import { MarketingPage } from "~/components/marketing";
import { CreatePostForm, PostCardSkeleton, PostList } from "~/components/posts";
import { RouterLink } from "~/components/router-link";
import { WaitlistForm } from "~/components/waitlist-form";
import { queries } from "~/lib/api";
import type { RawSearch, SearchValue } from "~/lib/search";
import { useSession } from "~/lib/session";

/** `?signin=1` and friends: one-shot hints other routes redirect here with. */
interface HomeSearch {
  signin?: true | undefined;
  waitlist?: true | undefined;
  maintenance?: true | undefined;
}

/**
 * A hint is set or it is not: `true` when the URL carries one of the three
 * spellings a redirect can produce, `undefined` otherwise. `undefined` is
 * what an absent key already read as, and router-core's `encode` drops it,
 * so the flag never reappears in the URL.
 */
const flag = (value: SearchValue): true | undefined =>
  value === true || value === 1 || value === "1" ? true : undefined;

const validateSearch = (search: RawSearch): HomeSearch => ({
  signin: flag(search.signin),
  waitlist: flag(search.waitlist),
  maintenance: flag(search.maintenance),
});

export const Route = createFileRoute("/")({
  validateSearch,
  loader: async ({ context: { queryClient } }) => {
    // What the page branches on must be ready before render; the posts
    // list is only needed for a signed-in visitor of the running app.
    const [session, launch, bootstrap] = await Promise.all([
      queryClient.ensureQueryData(queries.auth.session()),
      queryClient.ensureQueryData(queries.settings.launchState()),
      queryClient.ensureQueryData(queries.admin.bootstrapStatus()),
    ]);
    if (session.user && !launch.maintenanceMode && !bootstrap.requiresSetup) {
      await queryClient.prefetchQuery(queries.posts.list());
    }
  },
  component: HomePage,
});

function useSearchHints() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  useEffect(() => {
    if (!search.signin && !search.waitlist && !search.maintenance) return;
    // Deferred past this commit's effects: the Toaster mounts after the
    // page (it is a later sibling), and a toast raised before it subscribes
    // is lost.
    const timer = setTimeout(() => {
      if (search.signin) toast.info("Sign in to continue.");
      if (search.waitlist) {
        toast.info(
          "Sign-up is invite-only right now. Join the waitlist below.",
        );
      }
      if (search.maintenance) {
        toast.info("The app is in maintenance mode; sign-in is paused.");
      }
      void navigate({ to: "/", search: {}, replace: true });
    }, 0);
    return () => clearTimeout(timer);
  }, [search.signin, search.waitlist, search.maintenance, navigate]);
}

function HomePage() {
  useSearchHints();
  const session = useSession();
  const { data: launch } = useSuspenseQuery(queries.settings.launchState());
  const { data: bootstrap } = useSuspenseQuery(queries.admin.bootstrapStatus());

  if (bootstrap.requiresSetup) {
    return <BootstrapScreen />;
  }

  if (session.user && !launch.maintenanceMode) {
    return <AppHome />;
  }

  const shouldShowWaitlist =
    launch.maintenanceMode ||
    (!launch.signupEnabled && !launch.canAutoCreateAccounts);

  return (
    <MarketingPage
      eyebrow="Launch controls"
      title={
        launch.maintenanceMode
          ? "We are in maintenance mode"
          : "Build, launch, and collect interest without changing the template"
      }
      description={
        launch.maintenanceMode
          ? "The public shell is temporarily offline while the platform is being updated. Use the waitlist to collect interest, and review requests from admin settings."
          : "This template ships with a public landing page, support content, and a clean path for invite-only or open signup. Turn on the pieces you need from the admin controls."
      }
    >
      <div className="space-y-6">
        <LaunchBanner
          announcementMessage={launch.announcementMessage}
          announcementTone={launch.announcementTone}
          maintenanceMode={launch.maintenanceMode}
        />

        <div className="flex flex-wrap gap-3">
          {shouldShowWaitlist ? (
            <span className="border-border bg-card rounded-full border px-4 py-2 text-sm">
              Request access is open
            </span>
          ) : (
            <AuthShowcase />
          )}
          <RouterLink
            href="/pricing"
            className="border-border hover:bg-muted rounded-full border px-4 py-2 text-sm transition-colors"
          >
            See pricing
          </RouterLink>
          <RouterLink
            href="/contact"
            className="border-border hover:bg-muted rounded-full border px-4 py-2 text-sm transition-colors"
          >
            Contact support
          </RouterLink>
        </div>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <MarketingCard>
          <h2 className="text-xl font-semibold">Product surface</h2>
          <div className="text-muted-foreground mt-4 space-y-3 text-sm leading-6">
            <p>
              Landing, pricing, FAQ, changelog, contact, privacy, and terms.
            </p>
            <p>Admin launch toggles for maintenance mode and signup control.</p>
            <p>
              Waitlist review, referral tracking, and allowlist/domain settings.
            </p>
          </div>
        </MarketingCard>

        <MarketingCard>
          <h2 className="text-xl font-semibold">Access mode</h2>
          <div className="text-muted-foreground mt-4 space-y-3 text-sm leading-6">
            <p>
              {launch.signupEnabled
                ? "Sign up is enabled for new accounts."
                : "Sign up is disabled, so invite-only access is in effect."}
            </p>
            <p>
              {launch.canAutoCreateAccounts
                ? "Non-production environments auto-create accounts during social sign-in."
                : "Production environments fall back to waitlist review when access is blocked."}
            </p>
            <p>
              Allowed domains are configured in platform admin settings and can
              be expanded once the auth flow is tightened beyond the launch
              shell.
            </p>
          </div>
        </MarketingCard>
      </div>

      {shouldShowWaitlist ? (
        <div className="mt-10 max-w-2xl">
          <WaitlistForm
            source={launch.maintenanceMode ? "landing" : "blocked-signup"}
            title="Request access"
            description="Leave your email and a short note. We will use this queue to manage the waitlist and invite-only access."
            buttonLabel="Join waitlist"
          />
        </div>
      ) : null}
    </MarketingPage>
  );
}

/** The signed-in home: the posts demo, as the T3 scaffold shipped it. */
function AppHome() {
  return (
    <main className="container min-h-screen py-16">
      <div className="flex flex-col items-center justify-center gap-4">
        <h1 className="text-5xl font-extrabold tracking-tight sm:text-[5rem]">
          Create <span className="text-primary">T3</span> Turbo
        </h1>
        <AuthShowcase />
        <nav className="flex flex-wrap gap-3 text-sm" aria-label="Account">
          <RouterLink
            href="/settings"
            className="border-border hover:bg-muted rounded-full border px-4 py-2 transition-colors"
          >
            Settings
          </RouterLink>
          <AdminLink />
        </nav>

        <CreatePostForm />
        <div className="w-full max-w-2xl overflow-y-auto">
          <Suspense
            fallback={
              <div className="flex w-full flex-col gap-4">
                <PostCardSkeleton />
                <PostCardSkeleton />
                <PostCardSkeleton />
              </div>
            }
          >
            <PostList />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

function AdminLink() {
  const session = useSession();
  if (session.user?.role !== "admin") return null;
  return (
    <RouterLink
      href="/admin"
      className="border-border hover:bg-muted rounded-full border px-4 py-2 transition-colors"
    >
      Admin
    </RouterLink>
  );
}
