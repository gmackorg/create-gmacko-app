import { appRouter, createTRPCContext } from "@gmacko/api";
import { isMultiTenant } from "@gmacko/config";
import { Button } from "@gmacko/ui/button";
import { Input } from "@gmacko/ui/input";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth, getSession } from "~/auth/server";
import { buildWorkspaceSettingsPath } from "~/lib/workspace";
import { ApiKeysSection } from "./_components/api-keys";
import { PreferencesSection } from "./_components/preferences";

const COLLABORATION_ROLES = ["member", "admin"] as const;

type WorkspaceContext = {
  availableWorkspaces: Array<{ id: string; name: string; slug: string }>;
  workspace: { id: string; name: string; slug: string } | null;
  workspaceRole: "owner" | "admin" | "member" | null;
  platformRole: "user" | "admin";
  canManageWorkspace: boolean;
  isPlatformAdmin: boolean;
  inviteAllowlistCount: number;
  requiresWorkspaceSelection: boolean;
  workspaceSelectionSource: "header" | "default" | "none";
};

type PendingInvite = {
  id: string;
  email: string;
  role: "owner" | "admin" | "member";
};

type BillingOverview = {
  billing: {
    customerPortalAvailable: boolean;
    plan: {
      amountInCents: number;
      currency: string;
      description: string | null;
      id: string;
      interval: string;
      key: string;
      name: string;
    } | null;
    plans: Array<{
      amountInCents: number;
      currency: string;
      id: string;
      interval: string;
      isDefault: boolean;
      key: string;
      name: string;
    }>;
    providerConfigured: boolean;
    subscription: {
      cancelAtPeriodEnd: boolean;
      currentPeriodEnd: Date | null;
      currentPeriodStart: Date | null;
      provider: string;
      status: string;
    } | null;
    visible: boolean;
  };
  usage: {
    currentPeriodEnd: Date | null;
    currentPeriodStart: Date | null;
    limits: Array<{
      currentUsage: number;
      key: string;
      period: string;
      value: number | null;
    }>;
    meters: Array<{
      aggregation: string;
      currentUsage: number;
      key: string;
      latestPeriodEnd: Date | null;
      latestPeriodStart: Date | null;
      name: string;
      unit: string;
    }>;
    visible: boolean;
  };
};

function formatMoney(amountInCents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountInCents / 100);
}

function formatDate(value: Date | string | null) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(new Date(value));
}

export async function renderSettingsPage(input?: { workspaceSlug?: string }) {
  const session = await getSession();

  if (!session) {
    redirect("/");
  }

  const requestHeaders = new Headers(await headers());
  if (input?.workspaceSlug) {
    requestHeaders.set("x-gmacko-workspace-slug", input.workspaceSlug);
  }

  const caller = appRouter.createCaller(
    await createTRPCContext({
      headers: requestHeaders,
      authApi: auth.api,
    }),
  );
  const workspaceContext =
    (await caller.settings.getWorkspaceContext()) as WorkspaceContext;
  const billingOverview =
    (await caller.settings.getBillingOverview()) as BillingOverview;
  const pendingInvites: PendingInvite[] = workspaceContext.canManageWorkspace
    ? ((await caller.settings.listInvites()) as PendingInvite[])
    : [];

  if (
    isMultiTenant() &&
    workspaceContext.workspace &&
    !input?.workspaceSlug &&
    !workspaceContext.requiresWorkspaceSelection
  ) {
    redirect(buildWorkspaceSettingsPath(workspaceContext.workspace.slug));
  }

  async function createInviteAction(formData: FormData) {
    "use server";

    const currentSession = await getSession();
    if (!currentSession?.user) {
      redirect("/");
    }

    const email = formData.get("email");
    const role = formData.get("role");

    if (typeof email !== "string" || typeof role !== "string") {
      redirect("/settings?inviteError=input");
    }

    const inviteRole = role as (typeof COLLABORATION_ROLES)[number];

    if (!COLLABORATION_ROLES.includes(inviteRole)) {
      redirect("/settings?inviteError=role");
    }

    const actionHeaders = new Headers(await headers());
    if (input?.workspaceSlug) {
      actionHeaders.set("x-gmacko-workspace-slug", input.workspaceSlug);
    }

    const actionCaller = appRouter.createCaller(
      await createTRPCContext({
        headers: actionHeaders,
        authApi: auth.api,
      }),
    );

    await actionCaller.settings.createInvite({
      email: email.trim(),
      role: inviteRole,
    });

    redirect(
      input?.workspaceSlug
        ? buildWorkspaceSettingsPath(input.workspaceSlug)
        : "/settings",
    );
  }

  return (
    <main className="container mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-8 text-3xl font-bold">Settings</h1>

      <div className="space-y-8">
        {isMultiTenant() ? (
          <section className="rounded-lg border p-6">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Workspace</h2>
              <p className="text-muted-foreground text-sm">
                Multi-tenant web flows stay URL-scoped. Pick the workspace you
                want to manage and the page will carry that slug into
                tenant-aware API calls.
              </p>
            </div>

            {workspaceContext.workspace ? (
              <div className="mt-4 rounded-lg border p-4 text-sm">
                <p className="font-medium">{workspaceContext.workspace.name}</p>
                <p className="text-muted-foreground">
                  Slug: {workspaceContext.workspace.slug}
                </p>
                <p className="text-muted-foreground">
                  Role: {workspaceContext.workspaceRole ?? "none"}
                </p>
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed p-4 text-sm">
                <p className="font-medium">Choose a workspace</p>
                <p className="text-muted-foreground mt-1">
                  This account has access to more than one workspace, so the web
                  app needs an explicit workspace route before it can load
                  tenant-scoped settings.
                </p>
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {workspaceContext.availableWorkspaces.map((workspace) => {
                const isCurrent =
                  workspace.id === workspaceContext.workspace?.id;

                return (
                  <Link
                    key={workspace.id}
                    href={buildWorkspaceSettingsPath(workspace.slug)}
                    className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                      isCurrent
                        ? "border-foreground bg-foreground text-background"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {workspace.name}
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}

        <PreferencesSection />
        <ApiKeysSection />

        {billingOverview.billing.visible ? (
          <section className="rounded-lg border p-6">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Billing</h2>
              <p className="text-muted-foreground text-sm">
                Billing stays per-workspace in v1. Seat billing is intentionally
                out of scope for this first pass.
              </p>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border p-4">
                <h3 className="font-medium">Current plan</h3>
                {billingOverview.billing.plan ? (
                  <div className="mt-2 space-y-1 text-sm">
                    <p className="font-medium">
                      {billingOverview.billing.plan.name}
                    </p>
                    <p className="text-muted-foreground">
                      {formatMoney(
                        billingOverview.billing.plan.amountInCents,
                        billingOverview.billing.plan.currency,
                      )}{" "}
                      / {billingOverview.billing.plan.interval}
                    </p>
                    {billingOverview.billing.plan.description ? (
                      <p className="text-muted-foreground">
                        {billingOverview.billing.plan.description}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-muted-foreground mt-2 text-sm">
                    No workspace plan is configured yet.
                  </p>
                )}
              </div>

              <div className="rounded-lg border p-4">
                <h3 className="font-medium">Subscription status</h3>
                {billingOverview.billing.subscription ? (
                  <div className="mt-2 space-y-1 text-sm">
                    <p className="capitalize">
                      {billingOverview.billing.subscription.status.replaceAll(
                        "_",
                        " ",
                      )}
                    </p>
                    <p className="text-muted-foreground capitalize">
                      Provider: {billingOverview.billing.subscription.provider}
                    </p>
                    <p className="text-muted-foreground">
                      Current period ends{" "}
                      {formatDate(
                        billingOverview.billing.subscription.currentPeriodEnd,
                      )}
                    </p>
                  </div>
                ) : (
                  <p className="text-muted-foreground mt-2 text-sm">
                    No paid subscription is attached yet.
                  </p>
                )}
              </div>
            </div>

            {billingOverview.usage.visible ? (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <h3 className="font-medium">Plan limits</h3>
                  <ul className="mt-3 space-y-2 text-sm">
                    {billingOverview.usage.limits.map((limit) => (
                      <li
                        key={limit.key}
                        className="flex items-center justify-between"
                      >
                        <span className="text-muted-foreground">
                          {limit.key}
                        </span>
                        <span>
                          {limit.currentUsage} / {limit.value ?? "unlimited"}{" "}
                          {limit.period}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-lg border p-4">
                  <h3 className="font-medium">Usage meters</h3>
                  <ul className="mt-3 space-y-2 text-sm">
                    {billingOverview.usage.meters.map((meter) => (
                      <li
                        key={meter.key}
                        className="flex items-center justify-between"
                      >
                        <span className="text-muted-foreground">
                          {meter.name}
                        </span>
                        <span>
                          {meter.currentUsage} {meter.unit}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {workspaceContext.canManageWorkspace && workspaceContext.workspace ? (
          <section className="rounded-lg border p-6">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Collaboration</h2>
              <p className="text-muted-foreground text-sm">
                Invite teammates into {workspaceContext.workspace.name}. The
                active workspace route controls which invite list you are
                editing.
              </p>
            </div>

            <div className="mt-6 rounded-lg border p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-medium">Pending invites</h3>
                <span className="text-muted-foreground text-sm">
                  {pendingInvites.length}
                </span>
              </div>

              {pendingInvites.length > 0 ? (
                <ul className="mt-4 space-y-2">
                  {pendingInvites.map((invite) => (
                    <li
                      key={invite.id}
                      className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm"
                    >
                      <div>
                        <p className="font-medium">{invite.email}</p>
                        <p className="text-muted-foreground capitalize">
                          Role: {invite.role}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground mt-3 text-sm">
                  No invites are pending for the active workspace yet.
                </p>
              )}
            </div>

            <form action={createInviteAction} className="mt-6 space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-medium">Invite email</span>
                <Input
                  name="email"
                  placeholder="teammate@example.com"
                  type="email"
                  autoCapitalize="none"
                  required
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium">Role</span>
                <select
                  name="role"
                  defaultValue="member"
                  className="border-input bg-background text-foreground w-full rounded-md border px-3 py-2"
                >
                  {COLLABORATION_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>

              <Button type="submit">Create invite</Button>
            </form>
          </section>
        ) : null}
      </div>
    </main>
  );
}
