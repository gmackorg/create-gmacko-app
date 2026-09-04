/**
 * One place that turns what `run` rejects with into words. The contract's
 * errors are values (`Unauthorized`, `Forbidden{reason}`, `Conflict{reason}`,
 * ...), so a screen never inspects a status code or a message string: it
 * hands the error here and shows the result.
 */
import { ApiClientError, traceOf } from "@gmacko/api-client";
import {
  Conflict,
  type ConflictReason,
  Forbidden,
  NotFound,
  RateLimited,
  Unauthorized,
} from "@gmacko/domain";
import { toast } from "@gmacko/ui/toast";

export const conflictMessages: Readonly<Record<ConflictReason, string>> = {
  "invite-exists": "That email already has a pending invite.",
  "already-in-workspace": "That person is already a member of this workspace.",
  "owner-invite-unsupported":
    "Owners cannot be invited; invite as admin or member.",
  "bootstrap-already-completed": "Setup was already completed.",
  "bootstrap-already-started":
    "Someone else is completing setup right now; reload to continue.",
  "waitlist-status-changed":
    "This entry was reviewed by someone else; reload to see its status.",
  "self-demotion": "You cannot remove your own admin role.",
};

/**
 * A sentence a person can act on, for any rejection of `api()` or a mutation.
 *
 * `Error` is the type every one of those rejections has: the contract's
 * errors are `Schema.TaggedError` classes (which extend it), `ApiClientError`
 * extends it, and TanStack Query's `TError` defaults to it, so every
 * `onError` in the app hands one over already typed.
 */
export const describeApiError = (
  error: Error,
  fallback = "Something went wrong.",
): string => {
  if (error instanceof Unauthorized) return "Sign in to continue.";
  if (error instanceof Forbidden) {
    switch (error.reason) {
      case "scope":
        return "This API key lacks permission for that action.";
      case "origin":
        return "That request came from an origin this app does not trust.";
      case "role":
        return "You do not have the role needed for that action.";
      default:
        return "You are not allowed to do that.";
    }
  }
  if (error instanceof Conflict)
    return (
      conflictMessages[error.reason] ??
      "That change conflicts with the current state."
    );
  if (error instanceof RateLimited) {
    return `Too many requests; try again in ${Math.max(1, Math.round(error.retryAfterSeconds))}s.`;
  }
  if (error instanceof NotFound)
    return `That ${error.resource} no longer exists.`;
  if (error instanceof ApiClientError) {
    switch (error.kind) {
      case "transport":
        return "Could not reach the server; check your connection and try again.";
      case "status":
        return error.status !== undefined && error.status >= 500
          ? "The server had a problem; try again in a moment."
          : fallback;
      default:
        return fallback;
    }
  }
  return fallback;
};

/** `describeApiError`, plus the request id so a report can be matched to a trace. */
export const toastApiError = (error: Error, fallback?: string): void => {
  const trace = traceOf(error);
  toast.error(describeApiError(error, fallback), {
    description: trace?.requestId ? `Request ${trace.requestId}` : undefined,
  });
};

export const isUnauthorized = (error: unknown): error is Unauthorized =>
  error instanceof Unauthorized;
