/**
 * The isomorphic API client. On the server (SSR loaders) it calls the API
 * handler in-process through `localTransport`, forwarding the request's
 * cookie and the render's `RequestContext`, and runs on the app's
 * ManagedRuntime so calls inherit its logger and tracer; in the browser it
 * uses fetch against the page's origin. Same `HttpApiClient`, same types,
 * either way.
 */
import { AppApi } from "@gmacko/domain";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { type Context, Effect, Layer } from "effect";
import { FetchHttpClient, HttpClient } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";

import { localTransport } from "~/lib/local-transport";
import { apiHandler, renderContext, runtime } from "~/server/runtime";

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

interface Transport {
  readonly baseUrl: string;
  readonly layer: Layer.Layer<HttpClient.HttpClient>;
  /** Where a call runs: the app runtime on the server, a bare runtime in the browser. */
  readonly run: <A, E>(effect: Effect.Effect<A, E>) => Promise<A>;
}

/** The transport and the runtime differ per side; the client does not. */
const transport = createIsomorphicFn()
  .server((): Transport => {
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
      run: (effect) => runtime.runPromise(effect),
    };
  })
  .client(
    (): Transport => ({
      baseUrl: window.location.origin,
      layer: FetchHttpClient.layer,
      run: (effect) => Effect.runPromise(effect),
    }),
  );

const makeClient = (baseUrl: string) => HttpApiClient.make(AppApi, { baseUrl });

export type ApiClient = Effect.Success<ReturnType<typeof makeClient>>;

/** Runs one call against the API; rejects with the endpoint's typed error. */
export const api = <A, E>(
  call: (client: ApiClient) => Effect.Effect<A, E>,
): Promise<A> => {
  const { baseUrl, layer, run } = transport();
  return run(
    Effect.flatMap(makeClient(baseUrl), call).pipe(Effect.provide(layer)),
  );
};
