/**
 * Browser-side providers. PostHog is on only when `VITE_POSTHOG_KEY` is
 * set; without it the tree renders unchanged and nothing is loaded. The
 * provider initialises with `@gmacko/analytics/web`'s CSP-safe defaults (no
 * lazily-injected scripts; see src/server/headers.ts for the policy and
 * the nonce upgrade path).
 */
import { PostHogProvider } from "@gmacko/analytics/web";
import type { ReactNode } from "react";

import { env } from "~/env";

export function Providers({ children }: { children: ReactNode }) {
  const key = env.VITE_POSTHOG_KEY;
  if (!key) return children;
  return (
    <PostHogProvider
      apiKey={key}
      apiHost={env.VITE_POSTHOG_HOST}
      environment={import.meta.env.MODE}
    >
      {children}
    </PostHogProvider>
  );
}
