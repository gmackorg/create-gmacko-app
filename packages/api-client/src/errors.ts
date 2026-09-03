/**
 * What `run` rejects with when the failure is not one of the contract's
 * typed errors: the request never got a response, the response had a status
 * the endpoint does not declare (a proxy's 502, the server's 400 for a body
 * its decoder refused), the body did not decode, or the call died.
 *
 * Domain errors (`Unauthorized`, `Forbidden`, `NotFound`, `Conflict`,
 * `RateLimited`, `InternalError`, the health group's 503s) are rethrown as
 * the instances the contract decodes them into, so callers match on
 * `instanceof` or `_tag` and never see this class for them.
 */
export type ApiClientErrorKind =
  /** The request never got a response: the transport threw (DNS, connection, abort, a handler exception) or the header provider did. */
  | "transport"
  /** A status the endpoint does not declare (`status` carries it). */
  | "status"
  /** A success or error body that failed to decode against the contract. */
  | "decode"
  /** The request could not be encoded (params, query or payload). */
  | "encode"
  /** A defect inside the call. */
  | "defect"
  /** The fiber was interrupted. */
  | "interrupted";

/** `x-request-id` / `x-trace-id` of the response a call failed on, when one arrived. */
export interface RequestTrace {
  readonly requestId: string | undefined;
  readonly traceId: string | undefined;
}

export class ApiClientError extends Error {
  readonly _tag = "ApiClientError";
  readonly kind: ApiClientErrorKind;
  /** The HTTP status for `kind: "status"`; the response's status otherwise, when one arrived. */
  readonly status: number | undefined;
  readonly requestId: string | undefined;
  readonly traceId: string | undefined;

  constructor(options: {
    readonly kind: ApiClientErrorKind;
    readonly message: string;
    readonly status?: number | undefined;
    readonly cause?: unknown;
    readonly trace?: RequestTrace | undefined;
  }) {
    super(options.message, { cause: options.cause });
    this.name = "ApiClientError";
    this.kind = options.kind;
    this.status = options.status;
    this.requestId = options.trace?.requestId;
    this.traceId = options.trace?.traceId;
    if (options.trace !== undefined) recordTrace(this, options.trace);
  }
}

/**
 * The trace of the response a rejected call failed on, for any error `run`
 * rejects with (a domain error instance or an `ApiClientError`). Kept in a
 * side table so the contract's error classes stay exactly what the schema
 * decodes.
 */
const traces = new WeakMap<object, RequestTrace>();

export const recordTrace = (error: object, trace: RequestTrace): void => {
  if (trace.requestId !== undefined || trace.traceId !== undefined) {
    traces.set(error, trace);
  }
};

export const traceOf = (error: unknown): RequestTrace | undefined =>
  typeof error === "object" && error !== null ? traces.get(error) : undefined;
