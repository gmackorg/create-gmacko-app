/**
 * Browser-side providers. PostHog is on only when `VITE_POSTHOG_KEY` is
 * set; without it the tree renders unchanged and nothing is loaded.
 */
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { type ReactNode, useEffect } from "react";

import { env } from "~/env";

export function Providers({ children }: { children: ReactNode }) {
  const key = env.VITE_POSTHOG_KEY;
  useEffect(() => {
    if (!key || posthog.__loaded) return;
    posthog.init(key, {
      api_host: env.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com",
      person_profiles: "identified_only",
      capture_pageview: false,
      capture_pageleave: true,
    });
    posthog.register({ environment: import.meta.env.MODE });
  }, [key]);

  if (!key) return children;
  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
}
