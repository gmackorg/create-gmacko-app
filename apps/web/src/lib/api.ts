/**
 * The isomorphic API client: `@gmacko/api-client` on both sides. On the
 * server (SSR loaders) the transport calls the API handler in-process,
 * forwarding the page request's cookie and client address and the render's
 * `RequestContext`, and runs on the app's ManagedRuntime so calls inherit
 * its logger and tracer (the endpoint span parents on the render's). In the
 * browser it is fetch against the page's origin. Same client, same types,
 * same typed errors, either way.
 */
import {
  type ApiClientMethods,
  type ApiClient as Client,
  forwardedHeaders,
  makeApiClient,
} from "@gmacko/api-client";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { Context, Effect } from "effect";

import { apiHandler, renderContext, runtime } from "~/server/runtime";

/**
 * One client, and one `RequestContext`, per page request, keyed on TanStack
 * Start's request object (stable for the whole render), so every `api()`
 * call a loader makes shares the same session/role/membership reads.
 */
const renderClients = new WeakMap<Request, Client>();

const clientFor = (request: Request): Client => {
  let client = renderClients.get(request);
  if (client === undefined) {
    let context: Promise<Context.Context<never>> | undefined;
    client = makeApiClient({
      // Host is irrelevant in-process; the handler routes on the path.
      baseUrl: "http://localhost",
      transport: async (outgoing) => {
        context ??= renderContext(request.headers);
        return apiHandler(outgoing, await context);
      },
      headers: () => forwardedHeaders(request.headers),
      runtime: (effect) => runtime.runPromiseExit(effect),
    });
    renderClients.set(request, client);
  }
  return client;
};

let browserClient: Client | undefined;

/** The transport and the runtime differ per side; the client does not. */
const client = createIsomorphicFn()
  .server((): Client => clientFor(getRequest()))
  .client((): Client => {
    browserClient ??= makeApiClient({ baseUrl: window.location.origin });
    return browserClient;
  });

export type ApiClient = ApiClientMethods;

/** Runs one call against the API; rejects with the endpoint's typed error. */
export const api = <A, E>(
  call: (client: ApiClient) => Effect.Effect<A, E>,
): Promise<A> => client().run(call);
