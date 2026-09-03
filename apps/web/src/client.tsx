/// <reference types="vite/client" />
/**
 * Browser entry (the framework default, plus Sentry). Sentry
 * (`@gmacko/monitoring/web`, the browser SDK only) is initialised before
 * hydration so a hydration error is the first thing it can report; with no
 * DSN it stays off.
 */
import { initSentryWeb } from "@gmacko/monitoring/web";
import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";

import { env } from "~/env";

declare const __APP_VERSION__: string;

if (env.VITE_SENTRY_DSN) {
  initSentryWeb({
    dsn: env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    release: __APP_VERSION__,
    // Tracing belongs to the Worker's OTLP tracer; the browser reports errors.
    tracesSampleRate: 0,
  });
}

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
  );
});
