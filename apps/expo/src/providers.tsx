import type { ReactNode } from "react";
import { useEffect } from "react";

import { PostHogNativeProvider } from "@gmacko/analytics/native";
import { integrations } from "@gmacko/config";
import { initSentryNative } from "@gmacko/monitoring/native";

import { env } from "./config/env";

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  useEffect(() => {
    if (integrations.sentry && env.observability.sentryDsn) {
      initSentryNative({
        dsn: env.observability.sentryDsn,
        environment: env.environment,
        debug: env.enableDebugMode,
        tracesSampleRate: env.isProduction ? 0.1 : 1.0,
      });
    }
  }, []);

  if (integrations.posthog && env.observability.posthogKey) {
    return (
      <PostHogNativeProvider
        apiKey={env.observability.posthogKey}
        apiHost={env.observability.posthogHost}
      >
        {children}
      </PostHogNativeProvider>
    );
  }

  return <>{children}</>;
}
