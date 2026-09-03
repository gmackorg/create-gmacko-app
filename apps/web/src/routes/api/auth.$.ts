import { AppApi } from "@gmacko/domain";
import { createFileRoute } from "@tanstack/react-router";

import { apiHandler, authHandler } from "~/server/runtime";

/**
 * The contract's own `auth` group shares better-auth's prefix
 * (`/api/auth/session`, `/api/auth/secret`); those paths are the HttpApi's,
 * everything else under `/api/auth/*` is better-auth's.
 */
export const contractAuthPaths: ReadonlySet<string> = new Set(
  Object.values(AppApi.groups.auth.endpoints).map((endpoint) => endpoint.path),
);

const handle = (request: Request): Promise<Response> =>
  contractAuthPaths.has(new URL(request.url).pathname)
    ? apiHandler(request)
    : authHandler(request);

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
