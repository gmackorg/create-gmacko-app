/**
 * The seam between the typed client and the wire: a `Transport` takes one
 * web `Request` and returns its `Response`. The default is the platform's
 * `fetch`; the web app passes its API handler so SSR loaders call the API
 * in-process (no network hop, and the render's per-request services ride
 * along in the closure). Framework-free and `node:`-free so it runs in the
 * Worker, the browser and React Native alike.
 */
import { Context, Effect } from "effect";
import {
  HttpClient,
  HttpClientError,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/unstable/http";

import type { RequestTrace } from "./errors";

export type Transport = (request: Request) => Promise<Response>;

/** Header values to add to every request; `undefined` entries are skipped. */
export type HeadersRecord = Readonly<Record<string, string | undefined>>;
export type HeadersProvider = () => HeadersRecord | Promise<HeadersRecord>;

export const REQUEST_ID_HEADER = "x-request-id";
export const TRACE_ID_HEADER = "x-trace-id";

/**
 * A `RequestTrace` while the call is still open: the response's trace
 * headers are written into it as they arrive, and it is read back as the
 * readonly `RequestTrace` once the call has settled.
 */
export type OpenTrace = {
  -readonly [K in keyof RequestTrace]: RequestTrace[K];
};

/**
 * Where the trace headers of the last response land. `run` provides a fresh
 * record per call; a `Reference` has a default, so reading it adds no
 * requirement to the client's effect types.
 */
export const CallTrace = Context.Reference<OpenTrace>(
  "@gmacko/api-client/CallTrace",
  { defaultValue: () => ({ requestId: undefined, traceId: undefined }) },
);

/**
 * Only the named headers of `source`, lower-cased, present ones only. For an
 * SSR loader forwarding the page request's cookie and nothing else: an
 * `authorization` on the page request must not be replayed against every
 * endpoint a loader happens to call.
 */
export const pickHeaders = (
  source: Headers,
  names: ReadonlyArray<string>,
): Record<string, string> =>
  Object.fromEntries(
    names.flatMap((name) => {
      const value = source.get(name);
      return value === null ? [] : [[name.toLowerCase(), value] as const];
    }),
  );

/**
 * The incoming request headers an in-process dispatch carries over, and no
 * other: the cookie, so the API sees the session the page is rendered for,
 * and Cloudflare's client address, so the rate limiter keys an anonymous
 * SSR call on the browser rather than on nothing (`clientKeyOf` in
 * @gmacko/api). `authorization` is deliberately absent: a bearer token on the
 * page request must not be replayed against every endpoint a loader calls.
 */
export const FORWARDED_HEADERS: ReadonlyArray<string> = [
  "cookie",
  "cf-connecting-ip",
];

/** `pickHeaders(incoming, FORWARDED_HEADERS)`: what an SSR loader forwards. */
export const forwardedHeaders = (incoming: Headers): Record<string, string> =>
  pickHeaders(incoming, FORWARDED_HEADERS);

/** The entries of `headers` that carry a value; `undefined` ones are dropped. */
const present = (headers: HeadersRecord): Record<string, string> =>
  Object.fromEntries(
    Object.entries(headers).flatMap(([name, value]) =>
      value === undefined ? [] : [[name, value] as const],
    ),
  );

export interface HttpClientOptions {
  readonly transport: Transport;
  readonly headers?: HeadersProvider | undefined;
  readonly requestId?: (() => string) | undefined;
}

/** An `HttpClient` over `transport`, adding the provider's headers and recording the response's trace headers. */
export const makeHttpClient = (
  options: HttpClientOptions,
): HttpClient.HttpClient => {
  const dispatch = HttpClient.make((request, _url, signal) =>
    HttpClientRequest.toWeb(request, { signal }).pipe(
      Effect.mapError(
        (cause) =>
          new HttpClientError.HttpClientError({
            reason: new HttpClientError.InvalidUrlError({ request, cause }),
          }),
      ),
      Effect.flatMap((web) =>
        Effect.tryPromise({
          try: () => options.transport(web),
          catch: (cause) =>
            new HttpClientError.HttpClientError({
              reason: new HttpClientError.TransportError({ request, cause }),
            }),
        }),
      ),
      Effect.map((response) => HttpClientResponse.fromWeb(request, response)),
    ),
  );

  // A provider that throws (a token store that failed to read) is a
  // transport-class failure of this call, not a defect: `run` maps it to
  // `ApiClientError{kind: "transport"}` like a transport that rejected.
  const withHeaders = HttpClient.mapRequestEffect(dispatch, (request) =>
    Effect.map(
      Effect.tryPromise({
        try: async () => (await options.headers?.()) ?? {},
        catch: (cause) =>
          new HttpClientError.HttpClientError({
            reason: new HttpClientError.TransportError({
              request,
              cause,
              description: "header provider failed",
            }),
          }),
      }),
      (provided) => {
        const headers: Record<string, string> = present(provided);
        if (options.requestId !== undefined) {
          headers[REQUEST_ID_HEADER] = options.requestId();
        }
        return HttpClientRequest.setHeaders(request, headers);
      },
    ),
  );

  return HttpClient.transformResponse(withHeaders, (effect) =>
    Effect.tap(effect, (response) =>
      Effect.map(Effect.service(CallTrace), (trace) => {
        trace.requestId = response.headers[REQUEST_ID_HEADER];
        trace.traceId = response.headers[TRACE_ID_HEADER];
      }),
    ),
  );
};

/** The trace record `run` provides for one call, before any response. */
export const freshTrace = (): OpenTrace => ({
  requestId: undefined,
  traceId: undefined,
});
