import { createFileRoute } from "@tanstack/react-router";

import { authRouteOptions } from "~/server/auth-dispatch";
import { apiHandler, authHandler, guardAuthRequest } from "~/server/runtime";

/**
 * `/api/auth/*` is shared: the contract's `auth` group owns a few method+path
 * pairs, better-auth owns the rest. `~/server/auth-dispatch` decides which is
 * which; this module only binds it to the Worker runtime's handlers.
 */
export const Route = createFileRoute("/api/auth/$")(
  authRouteOptions({
    api: apiHandler,
    auth: authHandler,
    guard: guardAuthRequest,
  }),
);
