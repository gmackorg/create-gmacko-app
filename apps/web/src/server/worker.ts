/**
 * Custom Worker entry (wrangler.jsonc `main`).
 *
 * The Cloudflare Vite plugin would otherwise generate the Worker entry from
 * TanStack Start, which leaves nowhere to hang a `scheduled` handler, a Queue
 * consumer, or Sentry's `withSentry` wrapper. This module re-exports Start's
 * `fetch` and adds the rest.
 */
import startEntry from "@tanstack/react-start/server-entry";

export default {
  fetch: (request) => startEntry.fetch(request),
  scheduled(controller) {
    // oxlint-disable-next-line no-console -- Worker-level log; no logger is wired yet.
    console.log(
      `cron tick: ${controller.cron} at ${new Date(controller.scheduledTime).toISOString()}`,
    );
  },
} satisfies ExportedHandler<Cloudflare.Env>;
