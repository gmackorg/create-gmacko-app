import { appRouter, createTRPCContext } from "@gmacko/api";
import { createLogger } from "@gmacko/logging";
import { createFileRoute } from "@tanstack/react-router";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { auth } from "~/auth/server";

const log = createLogger({ module: "trpc-handler" });

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    router: appRouter,
    req,
    createContext: () =>
      createTRPCContext({
        authApi: auth.api,
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
