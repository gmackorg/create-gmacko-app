"use client";

import type { ReactNode } from "react";

import { PostHogProvider } from "@gmacko/analytics/web";
import { integrations } from "@gmacko/config";

import { env } from "~/env";

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  if (integrations.posthog && env.NEXT_PUBLIC_POSTHOG_KEY) {
    return (
      <PostHogProvider
        apiKey={env.NEXT_PUBLIC_POSTHOG_KEY}
        apiHost={env.NEXT_PUBLIC_POSTHOG_HOST}
      >
        {children}
      </PostHogProvider>
    );
  }

  return <>{children}</>;
}
