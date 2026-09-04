import { makeQueryClient, shouldRetry } from "@gmacko/api-client/queries";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { getGlobalStartContext } from "@tanstack/react-start";

import { toPlain } from "~/lib/plain";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  // `makeQueryClient` applies each mutation's `invalidates` meta on success
  // and retries per `shouldRetry` (never a typed 4xx). Retries are off on the
  // server so an SSR loader never waits on them.
  const queryClient = makeQueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        retry: typeof window === "undefined" ? false : shouldRetry,
      },
      dehydrate: { serializeData: toPlain },
    },
  });

  // The per-request CSP nonce minted by the security-headers middleware
  // (src/server/headers.ts). Start stamps it on every inline script it
  // emits; the browser picks it back up from the `csp-nonce` meta tag.
  const nonce = getGlobalStartContext()?.nonce;

  const router = createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    scrollRestoration: true,
    // Always passed: every reader in the router is `options.ssr?.nonce`, so
    // an undefined nonce here means exactly what an omitted `ssr` meant.
    ssr: { nonce },
  });
  setupRouterSsrQueryIntegration({
    router,
    queryClient,
  });

  return router;
}
