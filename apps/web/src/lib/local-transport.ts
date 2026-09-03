/**
 * An `HttpClient` that dispatches straight into the in-process web handler
 * instead of the network: tRPC's `unstable_localLink`, typed. Used by SSR
 * loaders, which run in the same isolate as the API.
 *
 * Only the incoming request's `cookie` header is forwarded (see
 * `FORWARDED_HEADERS`), so the API sees the same session the page was
 * rendered for and nothing else. `authorization` is deliberately not in the
 * set: a bearer token on the page request (an API key, a proxy credential)
 * must not be replayed against every endpoint a loader happens to call.
 */
import { Effect } from "effect";
import {
  HttpClient,
  HttpClientError,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/unstable/http";

/** The only incoming headers the in-process dispatch carries over. */
export const FORWARDED_HEADERS: ReadonlyArray<string> = ["cookie"];

export const localTransport = (
  handler: (request: Request) => Promise<Response>,
  incoming: Headers,
): HttpClient.HttpClient =>
  HttpClient.make((request, url, signal) =>
    HttpClientRequest.toWeb(request, { signal }).pipe(
      Effect.mapError(
        (cause) =>
          new HttpClientError.HttpClientError({
            reason: new HttpClientError.InvalidUrlError({ request, cause }),
          }),
      ),
      Effect.flatMap((web) => {
        const headers = new Headers(web.headers);
        for (const name of FORWARDED_HEADERS) {
          const value = incoming.get(name);
          if (value !== null && !headers.has(name)) headers.set(name, value);
        }
        const forwarded = new Request(web, { headers });
        return Effect.tryPromise({
          try: () => handler(forwarded),
          catch: (cause) =>
            new HttpClientError.HttpClientError({
              reason: new HttpClientError.TransportError({ request, cause }),
            }),
        }).pipe(
          Effect.tap((response) =>
            Effect.logDebug("localTransport: served in-process").pipe(
              Effect.annotateLogs({
                "http.method": request.method,
                "http.url": url.pathname,
                "http.status": response.status,
              }),
            ),
          ),
        );
      }),
      Effect.map((response) => HttpClientResponse.fromWeb(request, response)),
    ),
  );
