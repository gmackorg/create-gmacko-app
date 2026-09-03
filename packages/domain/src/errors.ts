/**
 * The errors every endpoint may answer with. Each is a `Schema.TaggedError`
 * annotated with its HTTP status (`httpApiStatus`, the annotation
 * `HttpApiSchema.status` writes), so the status lives in the schema and the
 * server, the generated client and the OpenAPI document cannot disagree.
 *
 * Resource-specific errors live next to their group (`<group>/errors.ts`)
 * and follow the same rule.
 */
import { Schema } from "effect";

/** No usable credential: missing, expired or revoked session or key. */
export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  "Unauthorized",
  {},
  { httpApiStatus: 401 },
) {
  override get message(): string {
    return "Authentication required";
  }
}

/**
 * Why a valid credential was refused:
 * - `scope`: the API key does not hold the scope the endpoint needs, or the
 *   endpoint accepts a session only;
 * - `origin`: a cookie session was sent on a non-GET request from an origin
 *   outside the allowlist;
 * - `role`: the user lacks the platform or workspace role.
 */
export const ForbiddenReason = Schema.Literals(["scope", "origin", "role"]);
export type ForbiddenReason = typeof ForbiddenReason.Type;

export class Forbidden extends Schema.TaggedError<Forbidden>()(
  "Forbidden",
  { reason: ForbiddenReason },
  { httpApiStatus: 403 },
) {
  override get message(): string {
    return `Forbidden (${this.reason})`;
  }
}

/** Every resource an endpoint can fail to find, by its contract name. */
export const NotFoundResource = Schema.Literals([
  "post",
  "user",
  "invite",
  "waitlistEntry",
  "apiKey",
  "workspace",
]);
export type NotFoundResource = typeof NotFoundResource.Type;

export class NotFound extends Schema.TaggedError<NotFound>()(
  "NotFound",
  { resource: NotFoundResource, id: Schema.String },
  { httpApiStatus: 404 },
) {
  override get message(): string {
    return `${this.resource} ${this.id} not found`;
  }
}

/**
 * The request is valid but the current state refuses it. Guarded writes
 * (`Database.updateWhere` changing zero rows) end here.
 */
export const ConflictReason = Schema.Literals([
  "invite-exists",
  "allowlist-exists",
  "already-in-workspace",
  "owner-invite-unsupported",
  "bootstrap-already-completed",
  "bootstrap-already-started",
  /** Optimistic guard: the entry's status is no longer what the reviewer read. */
  "waitlist-status-changed",
  "self-demotion",
]);
export type ConflictReason = typeof ConflictReason.Type;

export class Conflict extends Schema.TaggedError<Conflict>()(
  "Conflict",
  { reason: ConflictReason },
  { httpApiStatus: 409 },
) {
  override get message(): string {
    return `Conflict (${this.reason})`;
  }
}

export class RateLimited extends Schema.TaggedError<RateLimited>()(
  "RateLimited",
  { retryAfterSeconds: Schema.Number },
  { httpApiStatus: 429 },
) {
  override get message(): string {
    return `Rate limited; retry in ${this.retryAfterSeconds}s`;
  }
}

/**
 * Anything unexpected. Carries no fields on purpose: the cause goes to the
 * log and the trace, never to the client (AGENTS.md: health endpoints and
 * errors never leak internals).
 *
 * No endpoint declares it. Phase 4 attaches it once, through an api-level
 * middleware (`HttpApi.middleware`, declared with `error: InternalError`)
 * placed in api.ts *before* `.add(HealthApi)`: `HttpApi.middleware` only
 * reaches the endpoints present when it is called, so the health probes keep
 * their own 503 shapes and never gain a 500 that could carry detail.
 */
export class InternalError extends Schema.TaggedError<InternalError>()(
  "InternalError",
  {},
  { httpApiStatus: 500 },
) {
  override get message(): string {
    return "Internal server error";
  }
}
