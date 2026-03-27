import { appRouter, createTRPCContext } from "@gmacko/api";
import { Button } from "@gmacko/ui/button";
import { Input } from "@gmacko/ui/input";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth, getSession } from "~/auth/server";
import { ApiKeysSection } from "./_components/api-keys";
import { PreferencesSection } from "./_components/preferences";

const COLLABORATION_ROLES = ["member", "admin"] as const;

export default async function SettingsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/");
  }

  const requestHeaders = new Headers(await headers());
  const caller = appRouter.createCaller(
    await createTRPCContext({
      headers: requestHeaders,
      authApi: auth.api,
    }),
  );
  const workspaceContext = await caller.settings.getWorkspaceContext();
  const pendingInvites = workspaceContext.canManageWorkspace
    ? await caller.settings.listInvites()
    : [];
  const showCollaboration =
    workspaceContext.canManageWorkspace && workspaceContext.workspace;
  const collaborationWorkspaceName =
    workspaceContext.workspace?.name ?? "this workspace";

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
    const actionCaller = appRouter.createCaller(
      await createTRPCContext({
        headers: actionHeaders,
        authApi: auth.api,
      }),
    );

    try {
      await actionCaller.settings.createInvite({
        email: email.trim(),
        role: inviteRole,
      });
      redirect("/settings?inviteCreated=1");
    } catch {
      redirect("/settings?inviteError=create");
    }
  }

  return (
    <main className="container mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-8 text-3xl font-bold">Settings</h1>

      <div className="space-y-8">
        <PreferencesSection />
        <ApiKeysSection />
        {showCollaboration ? (
          <section className="rounded-lg border p-6">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Collaboration</h2>
              <p className="text-muted-foreground text-sm">
                Invite teammates into {collaborationWorkspaceName}. v1 keeps
                each account on a single active workspace and limits invites to
                member/admin roles.
              </p>
            </div>

            <form action={createInviteAction} className="mt-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
                <label className="space-y-2">
                  <span className="text-sm font-medium">Email</span>
                  <Input
                    type="email"
                    name="email"
                    placeholder="teammate@example.com"
                    required
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium">Role</span>
                  <select
                    name="role"
                    defaultValue="member"
                    className="bg-background h-10 rounded-md border px-3 text-sm"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>

                <div className="flex items-end">
                  <Button type="submit" className="w-full sm:w-auto">
                    Send Invite
                  </Button>
                </div>
              </div>
            </form>

            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Pending invites</h3>
                <span className="text-muted-foreground text-sm">
                  {pendingInvites.length}
                </span>
              </div>

              {pendingInvites.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No pending invites yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {pendingInvites.map((invite) => (
                    <li
                      key={invite.id}
                      className="flex items-center justify-between rounded-lg border px-4 py-3"
                    >
                      <div>
                        <p className="font-medium">{invite.email}</p>
                        <p className="text-muted-foreground text-sm capitalize">
                          {invite.role}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
