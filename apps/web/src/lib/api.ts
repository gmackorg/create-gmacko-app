/**
 * The isomorphic API client. On the server (SSR loaders) it calls the API
 * handler in-process through `localTransport`, forwarding the request's
 * cookie and the render's `RequestContext`; in the browser it uses fetch
 * against the page's origin. Same `HttpApiClient`, same types, either way.
 *
 * TODO(Phase 4): run the client through the app's ManagedRuntime instead of
 * `Effect.runPromise`, so calls inherit its logger and tracer (one trace per
 * SSR render) rather than a bare runtime per call.
 */
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { type Context, Effect, Layer } from "effect";
import { FetchHttpClient, HttpClient } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";

import { localTransport } from "~/lib/local-transport";
import { GmackoApi } from "~/server/api";
import { apiHandler, renderContext } from "~/server/runtime";

/**
 * One `RequestContext` per page request, keyed on TanStack Start's request
 * object (stable for the whole render), so every `api()` call a loader makes
 * shares the same session/role/membership reads.
 */
const renderContexts = new WeakMap<Request, Promise<Context.Context<never>>>();

const contextFor = (request: Request): Promise<Context.Context<never>> => {
  let context = renderContexts.get(request);
  if (context === undefined) {
    context = renderContext(request.headers);
    renderContexts.set(request, context);
  }
  return context;
};

/** The transport and the base URL differ per side; the client does not. */
const transport = createIsomorphicFn()
  .server(() => {
    const request = getRequest();
    return {
      // Host is irrelevant in-process; the handler routes on the path.
      baseUrl: "http://localhost",
      layer: Layer.effect(HttpClient.HttpClient)(
        Effect.map(
          Effect.promise(() => contextFor(request)),
          (context) => localTransport(apiHandler, request.headers, context),
        ),
      ),
    };
  })
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
