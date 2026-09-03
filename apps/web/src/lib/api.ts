/**
 * The isomorphic API client. On the server (SSR loaders) it calls the API
 * handler in-process through `localTransport`, forwarding the request's
 * cookie; in the browser it uses fetch against the page's origin. Same
 * `HttpApiClient`, same types, either way.
 */
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { Effect, Layer } from "effect";
import { FetchHttpClient, HttpClient } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";

import { localTransport } from "~/lib/local-transport";
import { GmackoApi } from "~/server/api";
import { apiHandler } from "~/server/runtime";

/** The transport and the base URL differ per side; the client does not. */
const transport = createIsomorphicFn()
  .server(() => ({
    // Host is irrelevant in-process; the handler routes on the path.
    baseUrl: "http://localhost",
    layer: Layer.succeed(HttpClient.HttpClient)(
      localTransport(apiHandler, new Headers(getRequestHeaders())),
    ),
  }))
  .client(() => ({
    baseUrl: window.location.origin,
    layer: FetchHttpClient.layer,
  }));

const makeClient = () => {
  const { baseUrl, layer } = transport();
  return HttpApiClient.make(GmackoApi, { baseUrl }).pipe(Effect.provide(layer));
};

export type ApiClient = Effect.Success<ReturnType<typeof makeClient>>;

/** Runs one call against the API; rejects with the endpoint's typed error. */
export const api = <A, E>(
  call: (client: ApiClient) => Effect.Effect<A, E>,
): Promise<A> => Effect.runPromise(Effect.flatMap(makeClient(), call));
