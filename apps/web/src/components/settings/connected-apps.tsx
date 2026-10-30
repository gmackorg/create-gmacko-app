import { ConnectedAppRow } from "@gmacko/ui/connected-app-row";
import { SettingsCard } from "@gmacko/ui/settings-card";
import { toast } from "@gmacko/ui/toast";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";

import { useApiErrorHandler } from "~/components/use-api-error";
import { mutations, queries } from "~/lib/api";

/**
 * Apps connected through OAuth (MCP clients pointed at `/mcp`): each is
 * pinned to one workspace with the scopes allowed at consent. Disconnecting
 * revokes its tokens at once.
 */
export function ConnectedAppsSection() {
  const { data: connections } = useSuspenseQuery(
    queries.oauth.listConnections(),
  );
  const onError = useApiErrorHandler();
  const revoke = useMutation({
    ...mutations.oauth.revokeConnection(),
    onSuccess: () => toast.success("App disconnected."),
    onError: (error) => onError(error, "Could not disconnect the app."),
  });

  return (
    <SettingsCard
      title="Connected apps"
      description="AI assistants and other apps you connected to this account over MCP."
      data-testid="connected-apps"
    >
      <div className="space-y-3">
        {connections.length === 0 ? (
          <p className="text-muted-foreground">No apps connected yet.</p>
        ) : (
          connections.map((connection) => (
            <ConnectedAppRow
              key={connection.id}
              app={{
                id: connection.id,
                clientName: connection.clientName,
                workspaceName: connection.workspace?.name ?? null,
                scopes: connection.scopes,
                createdAt: connection.createdAt,
              }}
              disabled={revoke.isPending}
              onRevoke={(id) => {
                if (
                  !window.confirm(
                    "Disconnect this app? It loses access immediately and has to be connected again.",
                  )
                ) {
                  return;
                }
                revoke.mutate(id);
              }}
            />
          ))
        )}
      </div>
    </SettingsCard>
  );
}
