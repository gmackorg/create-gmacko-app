import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import { AuthShowcase } from "~/components/auth-showcase";
import { queries } from "~/lib/api";
import { authorizeUrl } from "~/lib/oauth";
import { useSession } from "~/lib/session";

/**
 * The OAuth provider's login page: an app (an MCP client) asked to connect
 * and nobody is signed in. Every sign-in method comes back here
 * (`callbackURL` is this page with its query), and once there is a session
 * the client's original authorization request starts again.
 */
export const Route = createFileRoute("/oauth/sign-in")({
  loader: async ({ context: { queryClient } }) => {
    await queryClient.ensureQueryData(queries.auth.session());
  },
  head: () => ({ meta: [{ title: "Sign in to connect · Gmacko App" }] }),
  component: OAuthSignInPage,
});

function OAuthSignInPage() {
  const session = useSession();
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });

  useEffect(() => {
    if (session.user)
      window.location.assign(authorizeUrl(window.location.search));
  }, [session.user]);

  return (
    <main className="container mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-4 py-8">
      <div className="text-center">
        <h1 className="mb-2 text-3xl font-bold">Sign in to connect</h1>
        <p className="text-muted-foreground">
          An app wants to connect to your account. Sign in first; you will
          choose a workspace and what it may do next.
        </p>
      </div>
      {session.user ? (
        <p className="text-muted-foreground text-sm">Continuing…</p>
      ) : (
        <AuthShowcase callbackURL={`/oauth/sign-in${searchStr}`} />
      )}
    </main>
  );
}
