import { Button } from "./button";

export interface ConnectedAppSummary {
  readonly id: string;
  readonly clientName: string | null;
  /** `null` when the workspace has been deleted since. */
  readonly workspaceName: string | null;
  readonly scopes: ReadonlyArray<string>;
  readonly createdAt: Date;
}

// UTC, like ApiKeyRow: the row renders on the Worker and again in the browser.
const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(value);

/** One app connected through OAuth: which workspace, which scopes, and its revoke action. */
export function ConnectedAppRow(props: {
  app: ConnectedAppSummary;
  onRevoke: (id: string) => void;
  disabled?: boolean | undefined;
}) {
  const { app } = props;
  return (
    <div
      className="flex items-center justify-between gap-4 rounded-lg border p-4"
      data-testid="connected-app-row"
    >
      <div className="min-w-0">
        <p className="font-medium">{app.clientName ?? "Unnamed app"}</p>
        <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span>
            Workspace: {app.workspaceName ?? "deleted (no longer works)"}
          </span>
          <span>Scopes: {app.scopes.join(", ") || "none"}</span>
          <span>Connected: {formatDate(app.createdAt)}</span>
        </div>
      </div>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => props.onRevoke(app.id)}
        disabled={props.disabled}
      >
        Disconnect
      </Button>
    </div>
  );
}
