import { Button } from "./button";

export type WaitlistStatus = "pending" | "contacted" | "approved" | "dismissed";

export interface WaitlistEntrySummary {
  readonly id: string;
  readonly email: string;
  readonly source: string;
  readonly status: WaitlistStatus;
  readonly message: string | null;
  readonly referralCode: string | null;
  readonly createdAt: Date;
  readonly reviewedAt: Date | null;
}

const statusClasses: Record<WaitlistStatus, string> = {
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  contacted: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  approved: "bg-green-500/10 text-green-700 dark:text-green-300",
  dismissed: "bg-muted text-muted-foreground",
};

// UTC, not the runtime's zone: these render on the Worker (UTC) and
// again in the browser (the viewer's zone), and between UTC midnight and
// local midnight an unpinned formatter prints two different dates and
// fails hydration.
const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(value);

/** The waitlist queue with the review actions an admin takes on each entry. */
export function WaitlistReviewList(props: {
  entries: ReadonlyArray<WaitlistEntrySummary>;
  onReview: (id: string, status: WaitlistStatus) => void;
  disabled?: boolean | undefined;
}) {
  if (props.entries.length === 0) {
    return (
      <p className="text-muted-foreground text-sm" data-testid="waitlist-empty">
        No waitlist entries yet.
      </p>
    );
  }
  return (
    <ul className="space-y-3" data-testid="waitlist-review-list">
      {props.entries.map((entry) => (
        <li
          key={entry.id}
          className="rounded-lg border p-4"
          data-testid="waitlist-entry"
          data-waitlist-email={entry.email}
          data-waitlist-status={entry.status}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{entry.email}</p>
              <p className="text-muted-foreground text-sm">
                {entry.source} · {formatDate(entry.createdAt)}
                {entry.referralCode ? ` · ref ${entry.referralCode}` : ""}
              </p>
              {entry.message ? (
                <p className="mt-2 text-sm whitespace-pre-wrap">
                  {entry.message}
                </p>
              ) : null}
            </div>
            <span
              className={`rounded-full px-2 py-1 text-xs font-medium ${statusClasses[entry.status]}`}
            >
              {entry.status}
            </span>
          </div>
          {entry.status === "pending" ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={props.disabled}
                onClick={() => props.onReview(entry.id, "approved")}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={props.disabled}
                onClick={() => props.onReview(entry.id, "contacted")}
              >
                Mark contacted
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={props.disabled}
                onClick={() => props.onReview(entry.id, "dismissed")}
              >
                Dismiss
              </Button>
            </div>
          ) : entry.reviewedAt ? (
            <p className="text-muted-foreground mt-2 text-xs">
              Reviewed {formatDate(entry.reviewedAt)}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
