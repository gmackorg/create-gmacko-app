/**
 * The TanStack Start instance: global request middleware only. Every
 * response (pages, server routes, server functions) passes through
 * `securityHeaders`, which mints the CSP nonce the router stamps on inline
 * scripts (see src/router.tsx).
 */
import { createStart } from "@tanstack/react-start";

import { securityHeaders } from "~/server/headers";

export const startInstance = createStart(() => ({
  requestMiddleware: [securityHeaders],
}));

/**
 * Registers the instance's options so `getGlobalStartContext()` is typed
 * with what the request middlewares provide (the `nonce`). `Register`
 * lives in router-core; react-router re-exports it, as routeTree.gen.ts
 * relies on.
 */
declare module "@tanstack/react-router" {
  interface Register {
    config: Awaited<ReturnType<typeof startInstance.getOptions>>;
  }
}
