/**
 * `makeApiClient`: the typed `HttpApiClient` over `AppApi` plus `run`, the
 * one promise boundary every consumer uses. `run` resolves with the decoded
 * success and rejects with the typed domain error instance the contract
 * decodes (`instanceof NotFound`, `error._tag === "Forbidden"`), or with an
 * `ApiClientError` for everything that is not part of the contract.
 */
import { AppApi } from "@gmacko/domain";
import { Cause, Effect, type Exit, Schema } from "effect";
import { HttpClient, HttpClientError } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";

import { ApiClientError, type RequestTrace, recordTrace } from "./errors";
import {
  CallTrace,
  freshTrace,
  type HeadersProvider,
  makeHttpClient,
  type Transport,
} from "./transport";

/** Runs an effect to its exit: `Effect.runPromiseExit`, or an app runtime's. */
export type Runner = <A, E>(
  effect: Effect.Effect<A, E>,
) => Promise<Exit.Exit<A, E>>;

export interface ApiClientOptions {
  /** Origin the paths are resolved against. Ignored by an in-process transport, but still required by the URL encoder. */
  readonly baseUrl: string | URL;
  /** Where requests go; defaults to the platform `fetch`. */
  readonly transport?: Transport | undefined;
  /** The `fetch` to use when no transport is given (tests, polyfills). */
  readonly fetch?: typeof globalThis.fetch | undefined;
  /** Headers for every request: a session cookie, a bearer key. */
  readonly headers?: HeadersProvider | undefined;
  /** When given, every request carries `x-request-id` from it. */
  readonly requestId?: (() => string) | undefined;
  /** Where `run` executes; an app passes its `ManagedRuntime.runPromiseExit` so calls inherit its logger and tracer. */
  readonly runtime?: Runner | undefined;
}

const makeTyped = (
  baseUrl: string,
  httpClient: HttpClient.HttpClient,
): Effect.Effect<HttpApiClient.ForApi<typeof AppApi>> =>
  HttpApiClient.make(AppApi, { baseUrl }).pipe(
    Effect.provideService(HttpClient.HttpClient, httpClient),
  );

/** The generated client: `client.posts.byId({ params: { id } })` and so on. */
export type ApiClientMethods = Effect.Success<ReturnType<typeof makeTyped>>;

export interface ApiClient {
  readonly client: ApiClientMethods;
  /** One call, as a promise. Rejects with the typed error or `ApiClientError`. */
  readonly run: <A, E>(
    f: (client: ApiClientMethods) => Effect.Effect<A, E>,
  ) => Promise<A>;
}

const statusOf = (error: HttpClientError.HttpClientError): number | undefined =>
  error.response?.status;

const describe = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/** The rejection for a failed exit. */
const toThrown = (
  cause: Cause.Cause<unknown>,
  trace: RequestTrace,
): unknown => {
  const failed = Cause.findErrorOption(cause);
  if (failed._tag === "Some") {
    const error = failed.value;
    if (HttpClientError.isHttpClientError(error)) {
      const reason = error.reason;
      const status = statusOf(error);
      switch (reason._tag) {
        case "StatusCodeError":
          return new ApiClientError({
            kind: "status",
            status,
            message: `Unexpected status ${reason.response.status} from ${reason.methodAndUrl}`,
            cause: error,
            trace,
          });
        case "DecodeError":
        case "EmptyBodyError":
          // The client's decoder is only consulted for a declared status;
          // anything else lands here as a `DecodeError`. A 4xx/5xx the
          // contract does not declare (a proxy's 502, the server's empty 400
          // for a body its own decoder refused) is a status problem, not a
          // decoding one.
          return status !== undefined && status >= 400
            ? new ApiClientError({
                kind: "status",
                status,
                message: `Unexpected status ${status} from ${reason.methodAndUrl}`,
                cause: error,
                trace,
              })
            : new ApiClientError({
                kind: "decode",
                status,
                message: error.message,
                cause: error,
                trace,
              });
        case "EncodeError":
        case "InvalidUrlError":
          return new ApiClientError({
            kind: "encode",
            message: error.message,
            cause: error,
            trace,
          });
        default:
          return new ApiClientError({
            kind: "transport",
            message: `${reason.methodAndUrl}: ${describe(reason.cause ?? reason.description ?? error.message)}`,
            cause: error,
            trace,
          });
      }
    }
    if (Schema.isSchemaError(error)) {
      return new ApiClientError({
        kind: "decode",
        message: error.message,
        cause: error,
        trace,
      });
    }
    if (typeof error === "object" && error !== null) {
      recordTrace(error, trace);
    }
    return error;
  }
  if (Cause.hasInterrupts(cause)) {
    return new ApiClientError({
      kind: "interrupted",
      message: "Call interrupted",
      trace,
    });
  }
  const defect = Cause.squash(cause);
  return new ApiClientError({
    kind: "defect",
    message: describe(defect),
    cause: defect,
    trace,
  });
};

export const makeApiClient = (options: ApiClientOptions): ApiClient => {
  const baseUrl = String(options.baseUrl).replace(/\/+$/, "");
  const fetchImpl = options.fetch;
  const transport: Transport =
    options.transport ??
    ((request) =>
      fetchImpl === undefined ? globalThis.fetch(request) : fetchImpl(request));
  const httpClient = makeHttpClient({
    transport,
    headers: options.headers,
    requestId: options.requestId,
  });
  // Building the client only reads its services; nothing asynchronous.
  const client = Effect.runSync(makeTyped(baseUrl, httpClient));
  const runner: Runner = options.runtime ?? Effect.runPromiseExit;

  const run: ApiClient["run"] = async (f) => {
    const trace = freshTrace();
    const exit = await runner(
      Effect.provideService(f(client), CallTrace, trace),
    );
    if (exit._tag === "Success") return exit.value;
    throw toThrown(exit.cause, trace);
  };

  return { client, run };
};
