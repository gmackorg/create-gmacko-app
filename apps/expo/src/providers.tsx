import type { ReactNode } from "react";
import { useEffect } from "react";
import Constants from "expo-constants";

import { PostHogNativeProvider } from "@gmacko/analytics/native";
import { integrations } from "@gmacko/config";
import { initSentryNative } from "@gmacko/monitoring/native";

interface ProvidersProps {
  children: ReactNode;
}

function getEnvironment(): string {
  const releaseChannel = Constants.expoConfig?.extra?.releaseChannel;
  if (releaseChannel === "production") return "production";
  if (releaseChannel === "staging") return "staging";
  return "development";
}

export function Providers({ children }: ProvidersProps) {
  useEffect(() => {
    if (integrations.sentry) {
      const dsn = Constants.expoConfig?.extra?.sentryDsn;
      if (dsn) {
        initSentryNative({
          dsn,
          environment: getEnvironment(),
        });
      }
    }
  }, []);

  if (integrations.posthog) {
    return <PostHogNativeProvider>{children}</PostHogNativeProvider>;
  }

  return <>{children}</>;
}
