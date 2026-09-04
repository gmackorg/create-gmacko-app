import { Button } from "@gmacko/ui/button";
import {
  LaunchControlsForm,
  type LaunchControlsValues,
} from "@gmacko/ui/launch-controls-form";
import {
  SettingsCard,
  SettingsPanel,
  SettingsSkeleton,
} from "@gmacko/ui/settings-card";
import { StatsCard } from "@gmacko/ui/stats-card";
import { toast } from "@gmacko/ui/toast";
import { RoleBadge, UserAvatar } from "@gmacko/ui/users-table";
import { WaitlistReviewList } from "@gmacko/ui/waitlist-review-list";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";

import { RouterLink } from "~/components/router-link";
import { useApiErrorHandler } from "~/components/use-api-error";
import { mutations, queries } from "~/lib/api";

const RECENT = { limit: 5 } as const;

export const Route = createFileRoute("/admin/")({
  loader: async ({ context: { queryClient } }) => {
    await Promise.all([
      queryClient.prefetchQuery(queries.admin.stats()),
      queryClient.prefetchQuery(queries.admin.listUsers(RECENT)),
      queryClient.prefetchQuery(queries.admin.launchControls()),
      queryClient.prefetchQuery(queries.admin.listWaitlistEntries()),
      queryClient.prefetchQuery(queries.admin.bootstrapStatus()),
    ]);
  },
  head: () => ({ meta: [{ title: "Admin · Gmacko App" }] }),
  component: AdminDashboard,
});

function AdminDashboard() {
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-3xl font-bold">Admin Dashboard</h1>
      <Suspense fallback={<StatsSkeleton />}>
        <Stats />
      </Suspense>
      <Suspense
        fallback={<SettingsSkeleton title="Launch controls" rows={3} />}
      >
        <LaunchControls />
      </Suspense>
      <Suspense fallback={<SettingsSkeleton title="Waitlist" />}>
        <Waitlist />
      </Suspense>
      <Suspense fallback={<SettingsSkeleton title="Bootstrap" rows={1} />}>
        <Bootstrap />
      </Suspense>
      <Suspense fallback={<SettingsSkeleton title="Recent Users" rows={5} />}>
        <RecentUsers />
      </Suspense>
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      {["Total Users", "Workspaces", "Admin Users", "Regular Users"].map(
        (title) => (
          <StatsCard key={title} title={title} value={0} loading />
        ),
      )}
    </div>
  );
}

function Stats() {
  const { data: stats } = useSuspenseQuery(queries.admin.stats());
  return (
    <div className="grid gap-4 md:grid-cols-4" data-testid="admin-stats">
      <StatsCard title="Total Users" value={stats.totalUsers} />
      <StatsCard title="Workspaces" value={stats.totalWorkspaces} />
      <StatsCard title="Admin Users" value={stats.adminUsers} />
      <StatsCard title="Regular Users" value={stats.regularUsers} />
    </div>
  );
}

function LaunchControls() {
  const { data: controls } = useSuspenseQuery(queries.admin.launchControls());
  const onError = useApiErrorHandler();
  const update = useMutation({
    ...mutations.admin.updateLaunchControls(),
    onSuccess: () => toast.success("Launch controls saved."),
    onError: (error) => onError(error, "Could not save the launch controls."),
  });
  const values: LaunchControlsValues = {
    maintenanceMode: controls.maintenanceMode,
    signupEnabled: controls.signupEnabled,
    announcementMessage: controls.announcementMessage,
    announcementTone: controls.announcementTone,
    allowedEmailDomains: controls.allowedEmailDomains,
  };
  return (
    <SettingsCard
      title="Launch controls"
      data-testid="launch-controls"
      description={`Maintenance mode, sign-up and the public announcement. ${controls.waitlistCount} waitlist ${controls.waitlistCount === 1 ? "entry" : "entries"} so far.`}
    >
      <LaunchControlsForm
        // Re-seed the fields from the server's answer after every save.
        key={JSON.stringify(values)}
        values={values}
        submitting={update.isPending}
        onSubmit={(next) => update.mutate({ ...next })}
      />
    </SettingsCard>
  );
}

function Waitlist() {
  const { data: entries } = useSuspenseQuery(
    queries.admin.listWaitlistEntries(),
  );
  const onError = useApiErrorHandler();
  const review = useMutation({
    ...mutations.admin.reviewWaitlistEntry(),
    onSuccess: (entry) =>
      toast.success(`${entry.email} marked ${entry.status}.`),
    onError: (error) => onError(error, "Could not review that entry."),
  });
  return (
    <SettingsCard
      title="Waitlist"
      data-testid="waitlist"
      description="Requests from the public landing and contact forms. Approving adds the email to the sign-up allowlist."
    >
      <WaitlistReviewList
        entries={entries}
        disabled={review.isPending}
        onReview={(id, status) => review.mutate({ id, status })}
      />
    </SettingsCard>
  );
}

// UTC, not the runtime's zone: this renders on the Worker (UTC) and again
// in the browser (the viewer's zone), and between UTC midnight and local
// midnight an unpinned formatter prints two different dates and fails
// hydration.
const formatSetupDate = (value: Date) =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(value);

function Bootstrap() {
  const { data: status } = useSuspenseQuery(queries.admin.bootstrapStatus());
  return (
    <SettingsCard title="Bootstrap" data-testid="bootstrap-status">
      <SettingsPanel>
        <p className="text-sm">
          {status.isInitialized
            ? `Setup completed${status.setupCompletedAt ? ` on ${formatSetupDate(status.setupCompletedAt)}` : ""}.`
            : "Setup has not been completed: the first signed-in user to finish it becomes the platform admin."}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          {status.hasExistingWorkspace
            ? `Initial workspace: ${status.initialWorkspaceId ?? "present"}.`
            : "No workspace exists yet."}
        </p>
      </SettingsPanel>
    </SettingsCard>
  );
}

function RecentUsers() {
  const { data } = useSuspenseQuery(queries.admin.listUsers(RECENT));
  return (
    <SettingsCard
      title="Recent Users"
      data-testid="recent-users"
      actions={
        <Button variant="outline" size="sm" asChild>
          <RouterLink href="/admin/users">View All</RouterLink>
        </Button>
      }
    >
      <div className="space-y-2">
        {data.users.map((user) => (
          <div
            key={user.id}
            className="flex items-center justify-between rounded-lg border p-3"
          >
            <div className="flex items-center gap-3">
              <UserAvatar user={user} size="sm" />
              <div>
                <p className="font-medium">{user.name}</p>
                <p className="text-muted-foreground text-sm">{user.email}</p>
              </div>
            </div>
            <RoleBadge role={user.role} />
          </div>
        ))}
      </div>
    </SettingsCard>
  );
}
