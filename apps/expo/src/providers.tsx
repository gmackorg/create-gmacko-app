import type { ReactNode } from "react";

import { PostHogNativeProvider } from "@gmacko/analytics/native";
import { integrations } from "@gmacko/config";

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  if (integrations.posthog) {
    return <PostHogNativeProvider>{children}</PostHogNativeProvider>;
  }

  return <>{children}</>;
}
