"use client";

import { Button } from "./button";
import { type ScopeOption, ScopePicker } from "./scope-picker";

export interface OAuthClientSummary {
  readonly name: string;
  /** Where the client sends the user back; shown so they can recognise it. */
  readonly redirectHost: string;
  /** Registered by the app's operators; dynamically registered clients are not. */
  readonly verified: boolean;
}

/**
 * The consent screen of an OAuth authorization: which client, which
 * workspace the grant is pinned to, and the scopes it asked for, each one
 * untickable. The parent owns the selection and the requests.
 */
export function OAuthConsentCard(props: {
  client: OAuthClientSummary;
  workspaceName: string;
  options: ReadonlyArray<ScopeOption>;
  value: ReadonlyArray<string>;
  onChange: (next: ReadonlyArray<string>) => void;
  onApprove: () => void;
  onDeny: () => void;
  submitting?: boolean | undefined;
}) {
  const { client } = props;
  return (
    <section
      className="bg-card space-y-6 rounded-lg border p-6"
      data-testid="oauth-consent"
    >
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Connect {client.name}</h1>
        <p className="text-muted-foreground text-sm">
          {client.name} will act as you in{" "}
          <strong className="text-foreground">{props.workspaceName}</strong>,
          limited to what you allow below. It redirects to{" "}
          <code>{client.redirectHost}</code>.
        </p>
        {client.verified ? null : (
          <p
            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100"
            role="note"
          >
            This client registered itself and is not verified. Only continue if
            you started this connection.
          </p>
        )}
      </div>

      <ScopePicker
        name="scope"
        options={props.options}
        value={props.value}
        onChange={props.onChange}
        disabled={props.submitting}
      />

      <div className="flex gap-2">
        <Button
          onClick={props.onApprove}
          disabled={props.submitting || props.value.length === 0}
        >
          Allow
        </Button>
        <Button
          variant="outline"
          onClick={props.onDeny}
          disabled={props.submitting}
        >
          Deny
        </Button>
      </div>
    </section>
  );
}
