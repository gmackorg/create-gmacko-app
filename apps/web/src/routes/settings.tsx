import { SettingsSkeleton } from "@gmacko/ui/settings-card";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";

import { RouterLink } from "~/components/router-link";
import { ApiKeysSection } from "~/components/settings/api-keys";
import { BillingSections } from "~/components/settings/billing";
import { DeleteAccountSection } from "~/components/settings/delete-account";
import { PreferencesSection } from "~/components/settings/preferences";
import { WorkspaceSection } from "~/components/settings/workspace";
import { queries } from "~/lib/api";
import { requireUser } from "~/lib/guards";
import { useSession } from "~/lib/session";

export const Route = createFileRoute("/settings")({
  // Nothing is returned: a value here becomes route context and is
  // serialized for the browser, and the contract's class instances are not.
  beforeLoad: async ({ context: { queryClient } }) => {
    await requireUser(() =>
      queryClient.ensureQueryData(queries.auth.session()),
    );
  },
  loader: async ({ context: { queryClient } }) => {
    // `listInvites` is Forbidden(role) for a plain member, so the workspace
    // context decides whether it is fetched at all.
    const workspace = await queryClient.ensureQueryData(
      queries.settings.workspaceContext(),
    );
    await Promise.all([
      queryClient.prefetchQuery(queries.settings.getPreferences()),
      queryClient.prefetchQuery(queries.settings.listApiKeys()),
      queryClient.prefetchQuery(queries.settings.billingOverview()),
      workspace.canManageWorkspace && workspace.workspace
        ? queryClient.prefetchQuery(queries.settings.listInvites())
        : Promise.resolve(),
    ]);
  },
  head: () => ({ meta: [{ title: "Settings · Gmacko App" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const session = useSession();
  return (
    <main className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p
            className="text-muted-foreground text-sm"
            data-testid="settings-user"
          >
            {session.user?.name} · {session.user?.email}
          </p>
        </div>
        <nav className="flex gap-3 text-sm" aria-label="Account">
          <RouterLink
            href="/"
            className="border-border hover:bg-muted rounded-full border px-4 py-2 transition-colors"
          >
            Home
          </RouterLink>
          {session.user?.role === "admin" ? (
            <RouterLink
              href="/admin"
              className="border-border hover:bg-muted rounded-full border px-4 py-2 transition-colors"
            >
              Admin
            </RouterLink>
          ) : null}
        </nav>
      </div>

      <div className="space-y-8">
        <Suspense fallback={<SettingsSkeleton title="Preferences" />}>
          <PreferencesSection />
        </Suspense>
        <Suspense fallback={<SettingsSkeleton title="API Keys" />}>
          <ApiKeysSection />
        </Suspense>
        <Suspense fallback={<SettingsSkeleton title="Workspace" />}>
          <WorkspaceSection />
        </Suspense>
        <Suspense fallback={<SettingsSkeleton title="Billing" />}>
          <BillingSections />
        </Suspense>
        <DeleteAccountSection />
      </div>
    </main>
  );
}
