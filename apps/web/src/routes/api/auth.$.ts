import { createFileRoute } from "@tanstack/react-router";

import { makeAuthDispatch } from "~/server/auth-dispatch";
import { apiHandler, authHandler, guardAuthRequest } from "~/server/runtime";

/**
 * `/api/auth/*` is shared: the contract's `auth` group owns a few method+path
 * pairs, better-auth owns the rest. `~/server/auth-dispatch` decides which is
 * which; this module only binds it to the Worker runtime's handlers.
 */
const handle = makeAuthDispatch({
  api: apiHandler,
  auth: authHandler,
  guard: guardAuthRequest,
});

// The options object stays an inline literal here, and `server.handlers` an
// inline arrow. TanStack Start strips `server` from the client bundle by a
// static transform on this call; handing it an object built by a helper
// defeats that, and `~/server/runtime` — with its `cloudflare:workers`
// import — ends up in the browser graph, where the build fails to resolve it.
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      // Every method: better-auth answers what the contract does not claim
      // (its own 404 or 405), so nothing falls through to /api/$.
      ANY: ({ request }) => handle(request),
    },
  },
});
