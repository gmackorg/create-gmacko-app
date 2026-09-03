import { appRouter, createTRPCContext } from "@gmacko/legacy-api";
import { createLogger } from "@gmacko/logging";
import { createFileRoute } from "@tanstack/react-router";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { authApi } from "~/server/runtime";

const log = createLogger({ module: "trpc-handler" });

// TODO(Phase 5): delete with the tRPC routes; the Effect HttpApi replaces them.
const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    router: appRouter,
    req,
    createContext: async () =>
      createTRPCContext({
        authApi: await authApi(),
        headers: req.headers,
      }),
    onError({ error, path }) {
      log.error({ err: error, path }, "tRPC error");
    },
  });

export const Route = createFileRoute("/api/trpc/$")({
  server: {
    handlers: {
      GET: ({ request }) => handler(request),
      POST: ({ request }) => handler(request),
    },
  },
});
