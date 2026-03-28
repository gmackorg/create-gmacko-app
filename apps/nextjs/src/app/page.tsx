import { appRouter, createTRPCContext } from "@gmacko/api";
import { Button } from "@gmacko/ui/button";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { auth, getSession } from "~/auth/server";
import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { AuthShowcase } from "./_components/auth-showcase";
import { MarketingPage } from "./_components/marketing-page";
import {
  CreatePostForm,
  PostCardSkeleton,
  PostList,
} from "./_components/posts";
import { WaitlistForm } from "./_components/waitlist-form";

function LaunchBanner(props: {
  announcementMessage: string | null;
  announcementTone: string;
  maintenanceMode: boolean;
}) {
  if (!props.announcementMessage && !props.maintenanceMode) {
    return null;
  }

  const toneClasses = {
    info: "border-sky-500/40 bg-sky-500/10 text-sky-950",
    warning: "border-amber-500/40 bg-amber-500/10 text-amber-950",
    critical: "border-red-500/40 bg-red-500/10 text-red-950",
  } as const;

  const tone = props.announcementTone as keyof typeof toneClasses;

  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm ${
        toneClasses[tone] ?? toneClasses.info
      }`}
    >
      <p className="font-semibold">
        {props.maintenanceMode ? "Maintenance mode" : "Announcement"}
      </p>
      {props.announcementMessage ? (
        <p className="mt-1">{props.announcementMessage}</p>
      ) : null}
    </div>
  );
}

export default async function HomePage() {
  const session = await getSession();
  const requestHeaders = new Headers(await headers());
  const caller = appRouter.createCaller(
    await createTRPCContext({
      headers: requestHeaders,
      authApi: auth.api,
    }),
  );
  const settingsCaller = caller.settings as {
    getLaunchState: () => Promise<{
      announcementMessage: string | null;
      announcementTone: string;
      allowedEmailDomains: string[];
      canAutoCreateAccounts: boolean;
      inviteOnly: boolean;
      maintenanceMode: boolean;
      signupEnabled: boolean;
      stripeConfigured: boolean;
      publicAnnouncementVisible: boolean;
      canUseWaitlist: boolean;
    }>;
  };
  const bootstrapStatus = await caller.admin.bootstrapStatus();
  const launchState = await settingsCaller.getLaunchState();

  if (bootstrapStatus.requiresSetup) {
    async function completeBootstrap(formData: FormData) {
      "use server";

      const currentSession = await getSession();
      if (!currentSession?.user) {
        redirect("/");
      }

      const workspaceName = formData.get("workspaceName");
      if (
        typeof workspaceName !== "string" ||
        workspaceName.trim().length < 2
      ) {
        redirect("/?setupError=workspace-name");
      }

      const actionHeaders = new Headers(await headers());
      const actionCaller = appRouter.createCaller(
        await createTRPCContext({
          headers: actionHeaders,
          authApi: auth.api,
        }),
      );

      await actionCaller.admin.completeBootstrap({
        workspaceName: workspaceName.trim(),
      });

      redirect("/settings");
    }

    return (
      <main className="container mx-auto flex min-h-screen max-w-5xl flex-col gap-10 px-4 py-16">
        <section className="space-y-4">
          <p className="text-primary text-sm font-semibold uppercase tracking-[0.24em]">
            First-run setup
          </p>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
            Finish the initial app bootstrap
          </h1>
          <p className="text-muted-foreground max-w-2xl text-base sm:text-lg">
            This app has not been initialized yet. The first signed-in user will
            become the initial platform admin and own the first workspace.
          </p>
        </section>

        {session?.user ? (
          <section className="bg-card max-w-xl rounded-3xl border p-6 shadow-sm">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold">
                Create your first workspace
              </h2>
              <p className="text-muted-foreground text-sm">
                Signed in as {session.user.email}. Pick the name you want to use
                for the first workspace and finish setup.
              </p>
            </div>

            <form action={completeBootstrap} className="mt-6 space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-medium">Workspace name</span>
                <input
                  name="workspaceName"
                  defaultValue={
                    session.user.name ? `${session.user.name}'s workspace` : ""
                  }
                  placeholder="Acme HQ"
                  minLength={2}
                  maxLength={120}
                  required
                  className="border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 outline-none focus-visible:ring-2"
                />
              </label>
              <Button type="submit">Complete setup</Button>
            </form>
          </section>
        ) : (
          <section className="bg-card max-w-3xl rounded-3xl border p-6 shadow-sm">
            <div className="space-y-3">
              <h2 className="text-2xl font-semibold">
                Sign in to finish setup
              </h2>
              <p className="text-muted-foreground max-w-2xl text-sm sm:text-base">
                Authenticate first, then return here to create the initial
                workspace and promote that account to platform admin.
              </p>
            </div>
            <div className="mt-6">
              <AuthShowcase />
            </div>
          </section>
        )}
      </main>
    );
  }

  if (session && !launchState.maintenanceMode) {
    prefetch(trpc.post.all.queryOptions());

    return (
      <HydrateClient>
        <main className="container h-screen py-16">
          <div className="flex flex-col items-center justify-center gap-4">
            <h1 className="text-5xl font-extrabold tracking-tight sm:text-[5rem]">
              Create <span className="text-primary">T3</span> Turbo
            </h1>
            <AuthShowcase />

            <CreatePostForm />
            <div className="w-full max-w-2xl overflow-y-scroll">
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
      </HydrateClient>
    );
  }

  const shouldShowWaitlist =
    launchState.maintenanceMode ||
    (!launchState.signupEnabled && !launchState.canAutoCreateAccounts);

  return (
    <MarketingPage
      eyebrow="Launch controls"
      title={
        launchState.maintenanceMode
          ? "We are in maintenance mode"
          : "Build, launch, and collect interest without changing the template"
      }
      description={
        launchState.maintenanceMode
          ? "The public shell is temporarily offline while the platform is being updated. Use the waitlist to collect interest, and review requests from admin settings."
          : "This template ships with a public landing page, support content, and a clean path for invite-only or open signup. Turn on the pieces you need from the admin controls."
      }
    >
      <div className="space-y-6">
        <LaunchBanner
          announcementMessage={launchState.announcementMessage}
          announcementTone={launchState.announcementTone}
          maintenanceMode={launchState.maintenanceMode}
        />

        <div className="flex flex-wrap gap-3">
          {shouldShowWaitlist ? (
            <span className="border-border bg-card rounded-full border px-4 py-2 text-sm">
              Request access is open
            </span>
          ) : (
            <AuthShowcase />
          )}
          <a
            className="border-border hover:bg-muted rounded-full border px-4 py-2 text-sm transition-colors"
            href="/pricing"
          >
            See pricing
          </a>
          <a
            className="border-border hover:bg-muted rounded-full border px-4 py-2 text-sm transition-colors"
            href="/contact"
          >
            Contact support
          </a>
        </div>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <div className="border-border bg-card rounded-3xl border p-6 shadow-sm">
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
        </div>

        <div className="border-border bg-card rounded-3xl border p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Access mode</h2>
          <div className="text-muted-foreground mt-4 space-y-3 text-sm leading-6">
            <p>
              {launchState.signupEnabled
                ? "Sign up is enabled for new accounts."
                : "Sign up is disabled, so invite-only access is in effect."}
            </p>
            <p>
              {launchState.canAutoCreateAccounts
                ? "Non-production environments auto-create accounts during social sign-in."
                : "Production environments fall back to waitlist review when access is blocked."}
            </p>
            <p>
              Allowed domains are configured in platform admin settings and can
              be expanded once the auth flow is tightened beyond the launch
              shell.
            </p>
          </div>
        </div>
      </div>

      {shouldShowWaitlist ? (
        <div className="mt-10 max-w-2xl">
          <WaitlistForm
            source={launchState.maintenanceMode ? "landing" : "blocked-signup"}
            redirectTo="/"
            title="Request access"
            description="Leave your email and a short note. We will use this queue to manage the waitlist and invite-only access."
            buttonLabel="Join waitlist"
          />
        </div>
      ) : null}
    </MarketingPage>
  );
}
