import { SCOPES } from "@gmacko/domain";
import { OAuthConsentCard } from "@gmacko/ui/oauth-consent";
import { toast } from "@gmacko/ui/toast";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { queries } from "~/lib/api";
import {
  authorizeUrl,
  clientIdOf,
  fetchClientName,
  postOAuth,
  redirectHost,
  requestedScopes,
  signedOAuthQuery,
} from "~/lib/oauth";
import { useSession } from "~/lib/session";

/**
 * The OAuth provider's consent page: the client, the workspace picked on
 * the previous step, and the requested scopes, each one untickable (only
 * OAuth-grantable scopes are ever offered). Allowing sends the ticked subset
 * to the provider, which redirects back to the client with a code.
 */
export const Route = createFileRoute("/oauth/consent")({
  loader: async ({ context: { queryClient } }) => {
    await queryClient.ensureQueryData(queries.auth.session());
  },
  head: () => ({ meta: [{ title: "Connect an app · Gmacko App" }] }),
  component: OAuthConsentPage,
});

function OAuthConsentPage() {
  const session = useSession();
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const clientId = clientIdOf(searchStr);
  const scopes = requestedScopes(searchStr);
  const [selected, setSelected] = useState<ReadonlyArray<string>>(
    scopes.preselected,
  );
  const [submitting, setSubmitting] = useState(false);
  const choice = useQuery({
    ...queries.oauth.workspaces(),
    enabled: session.user !== null,
  });
  const clientName = useQuery({
    queryKey: ["oauth-client-name", clientId],
    queryFn: () => fetchClientName(clientId ?? ""),
    enabled: session.user !== null && clientId !== null,
  });

  useEffect(() => {
    if (session.user === null)
      window.location.assign(authorizeUrl(window.location.search));
  }, [session.user]);

  const workspace = choice.data?.workspaces.find(
    (w) => w.id === choice.data?.selected,
  );

  const respond = async (accept: boolean) => {
    setSubmitting(true);
    try {
      window.location.assign(
        await postOAuth("consent", {
          accept,
          scope: [...selected, ...scopes.passthrough].join(" "),
          oauth_query: signedOAuthQuery(window.location.search),
        }),
      );
    } catch (error) {
      setSubmitting(false);
      toast.error(
        error instanceof Error ? error.message : "Could not complete consent.",
      );
    }
  };

  return (
    <main className="container mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-8">
      {choice.isPending || clientName.isPending ? (
        <p className="text-muted-foreground text-center text-sm">Loading…</p>
      ) : (
        <OAuthConsentCard
          client={{
            name: clientName.data ?? "An app",
            redirectHost: redirectHost(searchStr),
            verified: false,
          }}
          workspaceName={workspace?.name ?? "your workspace"}
          options={scopes.offered.map((scope) => ({
            value: scope,
            description: SCOPES[scope].description,
          }))}
          value={selected}
          onChange={setSelected}
          submitting={submitting}
          onApprove={() => void respond(true)}
          onDeny={() => void respond(false)}
        />
      )}
    </main>
  );
}
