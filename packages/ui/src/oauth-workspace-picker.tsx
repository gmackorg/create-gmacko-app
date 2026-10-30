"use client";

import { Button } from "./button";

export interface WorkspaceOption {
  readonly id: string;
  readonly name: string;
  readonly role: string;
}

/**
 * Step one of connecting an OAuth client: the one workspace the grant will
 * be pinned to. With no memberships there is nothing to pick, and the
 * screen says so instead of offering an empty list.
 */
export function OAuthWorkspacePicker(props: {
  clientName: string;
  workspaces: ReadonlyArray<WorkspaceOption>;
  value: string | null;
  onChange: (workspaceId: string) => void;
  onContinue: () => void;
  submitting?: boolean | undefined;
}) {
  return (
    <section
      className="bg-card space-y-6 rounded-lg border p-6"
      data-testid="oauth-workspace-picker"
    >
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Choose a workspace</h1>
        <p className="text-muted-foreground text-sm">
          {props.clientName} will only be able to reach the workspace you pick.
          Connect again to give it another one.
        </p>
      </div>

      {props.workspaces.length === 0 ? (
        <p className="text-muted-foreground text-sm" role="note">
          You need to be a member of a workspace before you can connect an app.
        </p>
      ) : (
        <fieldset className="space-y-2">
          <legend className="sr-only">Workspace</legend>
          {props.workspaces.map((workspace) => (
            <label
              key={workspace.id}
              className="flex items-center gap-3 rounded-md border p-3 text-sm"
            >
              <input
                type="radio"
                name="workspace"
                value={workspace.id}
                checked={props.value === workspace.id}
                disabled={props.submitting}
                onChange={() => props.onChange(workspace.id)}
              />
              <span className="font-medium">{workspace.name}</span>
              <span className="text-muted-foreground ml-auto capitalize">
                {workspace.role}
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <Button
        onClick={props.onContinue}
        disabled={props.submitting || props.value === null}
      >
        Continue
      </Button>
    </section>
  );
}
