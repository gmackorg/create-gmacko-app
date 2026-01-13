import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { PostHogNativeProvider } from "@gmacko/analytics/native";
import { integrations } from "@gmacko/config";
import en from "@gmacko/i18n/messages/en.json";
import es from "@gmacko/i18n/messages/es.json";
import { I18nNativeProvider } from "@gmacko/i18n/native";
import { initSentryNative } from "@gmacko/monitoring/native";

import { env } from "./config/env";
import { getStoredLocale } from "./utils/i18n";

interface ProvidersProps {
  children: ReactNode;
}

const resources = {
  en: { translation: en },
  es: { translation: es },
} as const;

export function Providers({ children }: ProvidersProps) {
  const [initialLocale] = useState(getStoredLocale);

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

  const content = (
    <I18nNativeProvider resources={resources} initialLocale={initialLocale}>
      {children}
    </I18nNativeProvider>
  );

  if (integrations.posthog && env.observability.posthogKey) {
    return (
      <PostHogNativeProvider
        apiKey={env.observability.posthogKey}
        apiHost={env.observability.posthogHost}
      >
        {content}
      </PostHogNativeProvider>
    );
  }

  return content;
}
