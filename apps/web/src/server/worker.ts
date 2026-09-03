/**
 * Custom Worker entry (wrangler.jsonc `main`).
 *
 * The Cloudflare Vite plugin would otherwise generate the Worker entry from
 * TanStack Start, which leaves nowhere to hang a `scheduled` handler, a Queue
 * consumer, or Sentry's `withSentry` wrapper. This module re-exports Start's
 * `fetch` and adds the rest.
 */
import startEntry from "@tanstack/react-start/server-entry";
import { Effect } from "effect";

import { runtime } from "./runtime";

export default {
  fetch: (request) => startEntry.fetch(request),
  // Runs on the shared ManagedRuntime, so cron work gets the same services
  // (AppConfig, Database, Background) and logger as the HTTP handlers.
  scheduled: (controller) =>
    runtime.runPromise(
      Effect.logInfo("cron tick", {
        cron: controller.cron,
        scheduledTime: new Date(controller.scheduledTime).toISOString(),
      }),
    ),
} satisfies ExportedHandler<Cloudflare.Env>;
