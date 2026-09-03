/// <reference types="vite/client" />
/**
 * Browser entry (the framework default, plus Sentry). Sentry is
 * initialised before hydration so a hydration error is the first thing it
 * can report; with no DSN it stays off.
 */
import * as Sentry from "@sentry/react";
import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";

import { env } from "~/env";

declare const __APP_VERSION__: string;

if (env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    release: __APP_VERSION__,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
    ],
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
