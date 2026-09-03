import { Button } from "./button";

export interface ApiKeySummary {
  readonly id: string;
  readonly name: string;
  readonly keyPrefix: string;
  readonly permissions: ReadonlyArray<string>;
  readonly lastUsedAt: Date | null;
  readonly expiresAt: Date | null;
  readonly createdAt: Date;
}

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(value);
const formatDateTime = (value: Date) =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);

/** One API key as listed: name, prefix, scopes, dates, and its revoke action. */
export function ApiKeyRow(props: {
  apiKey: ApiKeySummary;
  onRevoke: (id: string) => void;
  disabled?: boolean | undefined;
}) {
  const { apiKey } = props;
  return (
    <div
      className="flex items-center justify-between gap-4 rounded-lg border p-4"
      data-testid="api-key-row"
    >
      <div className="min-w-0">
        <p className="font-medium">{apiKey.name}</p>
        <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="font-mono">{apiKey.keyPrefix}...</span>
          <span>Permissions: {apiKey.permissions.join(", ")}</span>
          <span>Created: {formatDate(apiKey.createdAt)}</span>
          {apiKey.expiresAt ? (
            <span>Expires: {formatDate(apiKey.expiresAt)}</span>
          ) : null}
        </div>
        {apiKey.lastUsedAt ? (
          <p className="text-muted-foreground mt-1 text-xs">
            Last used: {formatDateTime(apiKey.lastUsedAt)}
          </p>
        ) : null}
      </div>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => props.onRevoke(apiKey.id)}
        disabled={props.disabled}
      >
        Revoke
      </Button>
    </div>
  );
}
