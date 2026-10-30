import { OAuthWorkspacePicker } from "@gmacko/ui/oauth-workspace-picker";
import { toast } from "@gmacko/ui/toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { mutations, queries } from "~/lib/api";
import {
  authorizeUrl,
  clientIdOf,
  fetchClientName,
  postOAuth,
  signedOAuthQuery,
} from "~/lib/oauth";
import { useSession } from "~/lib/session";

/**
 * The OAuth provider's post-login step: the user pins the grant to one
 * workspace. The pick is stored for this browser session (`PUT
 * /api/oauth/workspace`), then the provider continues to consent.
 */
export const Route = createFileRoute("/oauth/workspace")({
  loader: async ({ context: { queryClient } }) => {
    await queryClient.ensureQueryData(queries.auth.session());
  },
  head: () => ({ meta: [{ title: "Choose a workspace · Gmacko App" }] }),
  component: OAuthWorkspacePage,
});

function OAuthWorkspacePage() {
  const session = useSession();
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const clientId = clientIdOf(searchStr);
  const choice = useQuery({
    ...queries.oauth.workspaces(),
    enabled: session.user !== null,
  });
  const clientName = useQuery({
    queryKey: ["oauth-client-name", clientId],
    queryFn: () => fetchClientName(clientId ?? ""),
    enabled: session.user !== null && clientId !== null,
  });
  const [picked, setPicked] = useState<string | null>(null);
  const select = useMutation(mutations.oauth.selectWorkspace());
  const [continuing, setContinuing] = useState(false);

  // Signed out in another tab: start the authorization again from sign-in.
  useEffect(() => {
    if (session.user === null)
      window.location.assign(authorizeUrl(window.location.search));
  }, [session.user]);

  const workspaces = choice.data?.workspaces ?? [];
  const value =
    picked ??
    choice.data?.selected ??
    (workspaces.length === 1 ? (workspaces[0]?.id ?? null) : null);

  return (
    <main className="container mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-8">
      {choice.isPending ? (
        <p className="text-muted-foreground text-center text-sm">Loading…</p>
      ) : (
        <OAuthWorkspacePicker
          clientName={clientName.data ?? "This app"}
          workspaces={workspaces}
          value={value}
          onChange={setPicked}
          submitting={continuing}
          onContinue={async () => {
            if (value === null) return;
            setContinuing(true);
            try {
              await select.mutateAsync(value);
              window.location.assign(
                await postOAuth("continue", {
                  postLogin: true,
                  oauth_query: signedOAuthQuery(window.location.search),
                }),
              );
            } catch (error) {
              setContinuing(false);
              toast.error(
                error instanceof Error ? error.message : "Could not continue.",
              );
            }
          }}
        />
      )}
    </main>
  );
}
